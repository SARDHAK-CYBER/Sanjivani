import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { put as blobPut, get as blobGet, del as blobDel, list as blobList, rename as blobRename } from "@vercel/blob";

/**
 * File storage, kept OUTSIDE /public so nothing is served without going through /api/files (which
 * enforces who may read what).
 *
 * Two backends, chosen the same way as rate-limit.ts picks Redis vs. Postgres: Vercel Blob when
 * BLOB_READ_WRITE_TOKEN is set (works on serverless hosts, where local disk does not survive between
 * invocations), otherwise the local disk under STORAGE_DIR (no cloud credentials needed for local dev
 * or tests).
 *
 * Layout (identical on both backends):  temp/<name>                     freshly uploaded, unclaimed
 *                                        <userId>/<name>                 a member's profile/ID/asset photos
 *                                        incidents/<incidentId>/<name>   evidence for one report
 *
 * Callers never accept a file URL from a client and store it verbatim. They "adopt" it with
 * adoptTempFile(), which only accepts a URL that this module itself minted for the temp folder.
 */

const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// The path is chosen at runtime (STORAGE_DIR), so tell Turbopack not to trace the whole project into
// the server bundle on account of it.
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR || path.join(process.cwd(), "storage", "uploads"));

export class StorageError extends Error {}

const SEGMENT = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)?$/;
const TEMP_URL = /^\/api\/files\/temp\/([a-f0-9]{32}\.(?:jpg|png|webp))$/;

export type ImageKind = { ext: "jpg" | "png" | "webp"; mime: string };

/** Identifies an image from its magic bytes (never from the client-supplied name or MIME type). */
export function detectImage(buffer: Buffer): ImageKind | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: "png", mime: "image/png" };
  }
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

export function contentTypeFor(fileName: string): string {
  switch (path.extname(fileName).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

/**
 * Validates path segments and returns a safe storage key ("incidents/abc/file.jpg"), or null if unsafe.
 * On the disk backend this doubles as (the basis of) the absolute filesystem path; on Blob it's the
 * pathname passed straight to the SDK.
 */
export function resolveStoragePath(segments: string[]): string | null {
  if (segments.length === 0 || !segments.every((s) => SEGMENT.test(s))) return null;
  if (!useBlob) {
    const resolved = path.resolve(ROOT, ...segments);
    return resolved.startsWith(ROOT + path.sep) ? resolved : null;
  }
  return segments.join("/");
}

/** Blob-key form of a path (disk's resolveStoragePath returns absolute paths; this always returns the key). */
function storageKey(segments: string[]): string | null {
  if (segments.length === 0 || !segments.every((s) => SEGMENT.test(s))) return null;
  return segments.join("/");
}

export async function saveTempImage(buffer: Buffer, kind: ImageKind): Promise<string> {
  const name = `${crypto.randomBytes(16).toString("hex")}.${kind.ext}`;
  if (useBlob) {
    await blobPut(`temp/${name}`, buffer, { access: "private", contentType: kind.mime, addRandomSuffix: false });
  } else {
    const dir = path.join(ROOT, "temp");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), buffer, { flag: "wx" });
  }
  return `/api/files/temp/${name}`;
}

/**
 * Moves a temp upload into its permanent folder and returns its new URL.
 * Throws StorageError if `url` is not a temp URL minted by saveTempImage or the file is gone.
 */
export async function adoptTempFile(url: unknown, destination: string[]): Promise<string> {
  const match = typeof url === "string" ? TEMP_URL.exec(url) : null;
  if (!match) throw new StorageError("Invalid file reference.");

  const name = match[1];
  const sourceKey = storageKey(["temp", name]);
  const destKey = storageKey(destination);
  if (!sourceKey || !destKey) throw new StorageError("Invalid file reference.");

  if (useBlob) {
    try {
      await blobRename(sourceKey, `${destKey}/${name}`, { access: "private" });
    } catch {
      throw new StorageError("Uploaded file was not found or has expired. Please upload it again.");
    }
  } else {
    const source = resolveStoragePath(["temp", name])!;
    const destDir = resolveStoragePath(destination)!;
    await fs.mkdir(destDir, { recursive: true });
    try {
      await fs.rename(source, path.join(/*turbopackIgnore: true*/ destDir, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new StorageError("Uploaded file was not found or has expired. Please upload it again.");
      }
      throw error;
    }
  }
  return `/api/files/${destination.join("/")}/${name}`;
}

/** adoptTempFile for optional fields: null/undefined/"" pass through as null. */
export async function adoptOptionalTempFile(url: unknown, destination: string[]): Promise<string | null> {
  if (url === null || url === undefined || url === "") return null;
  return adoptTempFile(url, destination);
}

export async function removeStoredDirectory(segments: string[]): Promise<void> {
  if (useBlob) {
    const prefix = storageKey(segments);
    if (!prefix) return;
    let cursor: string | undefined;
    do {
      const { blobs, cursor: next, hasMore } = await blobList({ prefix: `${prefix}/`, cursor });
      if (blobs.length) await blobDel(blobs.map((b) => b.pathname));
      cursor = hasMore ? next : undefined;
    } while (cursor);
  } else {
    const dir = resolveStoragePath(segments);
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Deletes temp uploads nobody claimed within `maxAgeMs`. */
export async function cleanupTemp(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  const cutoff = Date.now() - maxAgeMs;
  if (useBlob) {
    let cursor: string | undefined;
    const stale: string[] = [];
    do {
      const { blobs, cursor: next, hasMore } = await blobList({ prefix: "temp/", cursor });
      for (const b of blobs) {
        if (new Date(b.uploadedAt).getTime() < cutoff) stale.push(b.pathname);
      }
      cursor = hasMore ? next : undefined;
    } while (cursor);
    if (stale.length) await blobDel(stale);
    return;
  }
  const dir = path.join(ROOT, "temp");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(dir, entry);
      try {
        if ((await fs.stat(file)).mtimeMs < cutoff) await fs.unlink(file);
      } catch {
        /* already gone */
      }
    })
  );
}

/**
 * Reads a stored file by the key resolveStoragePath returned (an absolute path on disk, a blob
 * pathname on Blob). Returns null if it doesn't exist.
 */
export async function readStoredFile(resolvedPath: string): Promise<ReadableStream<Uint8Array> | Buffer | null> {
  if (useBlob) {
    try {
      const result = await blobGet(resolvedPath, { access: "private" });
      return result?.stream ?? null;
    } catch {
      return null;
    }
  }
  try {
    const stat = await fs.stat(resolvedPath);
    return stat.isFile() ? await fs.readFile(resolvedPath) : null;
  } catch {
    return null;
  }
}

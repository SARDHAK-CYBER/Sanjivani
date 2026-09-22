import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * File storage on the local disk, kept OUTSIDE /public so nothing is served without going through
 * /api/files (which enforces who may read what).
 *
 * Layout:  <root>/temp/<name>                     freshly uploaded, not yet attached to anything
 *          <root>/<userId>/<name>                 a member's profile / ID / asset photos
 *          <root>/incidents/<incidentId>/<name>   evidence for one report
 *
 * Callers never accept a file URL from a client and store it verbatim. They "adopt" it with
 * adoptTempFile(), which only accepts a URL that this module itself minted for the temp folder.
 *
 * NOTE: local disk does not survive serverless deployments (e.g. Vercel). To deploy there, swap the
 * bodies of the functions in this file for Google Cloud Storage / S3; the rest of the
 * app only talks to this interface.
 */

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

/** Joins segments under the storage root, rejecting anything that could escape it. Null if unsafe. */
export function resolveStoragePath(segments: string[]): string | null {
  if (segments.length === 0 || !segments.every((s) => SEGMENT.test(s))) return null;
  const resolved = path.resolve(ROOT, ...segments);
  return resolved.startsWith(ROOT + path.sep) ? resolved : null;
}

export async function saveTempImage(buffer: Buffer, kind: ImageKind): Promise<string> {
  const name = `${crypto.randomBytes(16).toString("hex")}.${kind.ext}`;
  const dir = path.join(ROOT, "temp");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buffer, { flag: "wx" });
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
  const source = resolveStoragePath(["temp", name]);
  const destDir = resolveStoragePath(destination);
  if (!source || !destDir) throw new StorageError("Invalid file reference.");

  await fs.mkdir(destDir, { recursive: true });
  try {
    await fs.rename(source, path.join(/*turbopackIgnore: true*/ destDir, name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new StorageError("Uploaded file was not found or has expired. Please upload it again.");
    }
    throw error;
  }
  return `/api/files/${destination.join("/")}/${name}`;
}

/** adoptTempFile for optional fields: null/undefined/"" pass through as null. */
export async function adoptOptionalTempFile(url: unknown, destination: string[]): Promise<string | null> {
  if (url === null || url === undefined || url === "") return null;
  return adoptTempFile(url, destination);
}

export async function removeStoredDirectory(segments: string[]): Promise<void> {
  const dir = resolveStoragePath(segments);
  if (dir) await fs.rm(dir, { recursive: true, force: true });
}

/** Deletes temp uploads nobody claimed within `maxAgeMs`. */
export async function cleanupTemp(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  const dir = path.join(ROOT, "temp");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - maxAgeMs;
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

export async function readStoredFile(absolutePath: string): Promise<Buffer | null> {
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isFile() ? await fs.readFile(absolutePath) : null;
  } catch {
    return null;
  }
}

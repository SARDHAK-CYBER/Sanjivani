import "./setup";
import fs from "fs";
import path from "path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  StorageError,
  adoptOptionalTempFile,
  adoptTempFile,
  contentTypeFor,
  detectImage,
  resolveStoragePath,
  saveTempImage,
} from "../src/lib/storage";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16)]);

describe("detectImage (magic bytes, not names)", () => {
  it("recognises JPEG, PNG and WebP", () => {
    assert.equal(detectImage(JPEG)?.ext, "jpg");
    assert.equal(detectImage(PNG)?.ext, "png");
    assert.equal(detectImage(WEBP)?.ext, "webp");
  });

  it("rejects HTML, SVG, GIF and tiny buffers even if a client calls them images", () => {
    assert.equal(detectImage(Buffer.from("<html><script>alert(1)</script></html>")), null);
    assert.equal(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
    assert.equal(detectImage(Buffer.from("GIF89a" + "x".repeat(20))), null);
    assert.equal(detectImage(Buffer.from([0xff, 0xd8])), null);
  });
});

describe("resolveStoragePath", () => {
  it("resolves plain segments under the storage root", () => {
    const resolved = resolveStoragePath(["incidents", "abc-123", "file.jpg"]);
    assert.ok(resolved?.startsWith(process.env.STORAGE_DIR!));
  });

  it("rejects traversal and odd segments", () => {
    for (const bad of [
      ["..", "etc", "passwd"],
      ["temp", ".."],
      ["temp", "..%2f..%2fsecret"],
      ["a/b"],
      ["a\\b"],
      [".hidden"],
      [""],
      [],
    ]) {
      assert.equal(resolveStoragePath(bad), null, JSON.stringify(bad));
    }
  });
});

describe("temp uploads and adoption", () => {
  it("saveTempImage stores under temp with a random name and the detected extension", async () => {
    const url = await saveTempImage(PNG, detectImage(PNG)!);
    assert.match(url, /^\/api\/files\/temp\/[a-f0-9]{32}\.png$/);
    assert.ok(fs.existsSync(path.join(process.env.STORAGE_DIR!, "temp", url.split("/").pop()!)));
  });

  it("adoptTempFile moves the file into its permanent folder and returns the new URL", async () => {
    const url = await saveTempImage(JPEG, detectImage(JPEG)!);
    const name = url.split("/").pop()!;
    const adopted = await adoptTempFile(url, ["user-42"]);

    assert.equal(adopted, `/api/files/user-42/${name}`);
    assert.ok(fs.existsSync(path.join(process.env.STORAGE_DIR!, "user-42", name)));
    assert.ok(!fs.existsSync(path.join(process.env.STORAGE_DIR!, "temp", name)), "temp copy must be gone");
  });

  it("refuses anything that is not a URL this module minted", async () => {
    for (const bad of [
      "https://evil.example/x.jpg",
      "/api/files/some-user-id/other.jpg", // someone else's already-adopted file
      "/api/files/temp/../secret.jpg",
      "/api/files/temp/short.jpg",
      "/api/files/temp/" + "a".repeat(32) + ".html",
      "",
      null,
      undefined,
      42,
    ]) {
      await assert.rejects(adoptTempFile(bad, ["u"]), StorageError, String(bad));
    }
  });

  it("cannot be adopted twice, and reports a missing file", async () => {
    const url = await saveTempImage(JPEG, detectImage(JPEG)!);
    await adoptTempFile(url, ["once"]);
    await assert.rejects(adoptTempFile(url, ["twice"]), StorageError);
  });

  it("adoptOptionalTempFile passes empty values through as null", async () => {
    assert.equal(await adoptOptionalTempFile(null, ["u"]), null);
    assert.equal(await adoptOptionalTempFile(undefined, ["u"]), null);
    assert.equal(await adoptOptionalTempFile("", ["u"]), null);
  });
});

describe("contentTypeFor", () => {
  it("maps image extensions and defaults to octet-stream", () => {
    assert.equal(contentTypeFor("a.jpg"), "image/jpeg");
    assert.equal(contentTypeFor("a.JPEG"), "image/jpeg");
    assert.equal(contentTypeFor("a.png"), "image/png");
    assert.equal(contentTypeFor("a.webp"), "image/webp");
    assert.equal(contentTypeFor("a.html"), "application/octet-stream");
  });
});

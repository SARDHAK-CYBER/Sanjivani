import { NextResponse } from "next/server";
import { errorJson, limitByIp } from "@/lib/http";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { cleanupTemp, detectImage, saveTempImage } from "@/lib/storage";

/**
 * Accepts one image and parks it in the temp area, returning a temp URL. Registration and bystander
 * reports upload before an account/incident exists, so this is open to anonymous callers, but
 * rate-limited per IP, size-capped, and content-sniffed. Nothing here decides who may *read* the
 * file (see /api/files) or which record it belongs to (see adoptTempFile).
 */
export async function POST(request: Request) {
  try {
    const { blocked } = await limitByIp(request, "uploadIp");
    if (blocked) return blocked;

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return errorJson("File too large (max 5 MB)", 413);

    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) return errorJson("No file provided", 400);
    if (file.size === 0) return errorJson("File is empty", 400);
    if (file.size > MAX_UPLOAD_BYTES) return errorJson("File too large (max 5 MB)", 413);

    const buffer = Buffer.from(await file.arrayBuffer());
    // The type comes from the bytes, never from the client-supplied name or Content-Type, and the
    // stored extension is derived from it, so a "photo.html" cannot be stored as HTML.
    const kind = detectImage(buffer);
    if (!kind) return errorJson("Only JPEG, PNG or WebP images are allowed", 400);

    const url = await saveTempImage(buffer, kind);
    if (Math.random() < 0.02) void cleanupTemp();

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error("Upload Error:", error);
    return errorJson("Upload failed", 500);
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-guard";
import { bearerToken, verifyBystanderToken } from "@/lib/tokens";
import { contentTypeFor, readStoredFile, resolveStoragePath } from "@/lib/storage";

/**
 * Serves stored files, deciding per request who may read them:
 *   temp/…                     admins only (unclaimed uploads)
 *   <userId>/…                 that member, and admins
 *   incidents/<id>/…           admins, the owner of the asset the report is about, and the
 *                              bystander who filed it
 * Authentication is checked before the filesystem is touched, so callers cannot probe which files exist.
 */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: segments } = await params;
    const absolutePath = resolveStoragePath(segments);
    if (!absolutePath) return new NextResponse("Not Found", { status: 404 });

    if (!(await canRead(request, segments))) return new NextResponse("Unauthorized", { status: 401 });

    const file = await readStoredFile(absolutePath);
    if (!file) return new NextResponse("Not Found", { status: 404 });

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentTypeFor(absolutePath),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("File Serving Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

async function canRead(request: Request, segments: string[]): Promise<boolean> {
  const [scope, incidentId] = segments;

  const user = await getSessionUser();
  if (user) {
    if (user.role === "ADMIN") return true;
    if (scope === user.id) return true;
    if (scope === "incidents" && incidentId) {
      const owned = await prisma.incident.findFirst({
        where: { id: incidentId, asset: { userId: user.id } },
        select: { id: true },
      });
      if (owned) return true;
    }
  }

  const token = bearerToken(request);
  if (token && scope === "incidents" && incidentId) {
    const bystander = await verifyBystanderToken(token);
    if (bystander) {
      const filed = await prisma.incident.findFirst({
        where: { id: incidentId, bystanderId: bystander.bystanderId },
        select: { id: true },
      });
      if (filed) return true;
    }
  }
  return false;
}

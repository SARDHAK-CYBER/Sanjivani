import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { errorJson, unauthorized } from "@/lib/http";

/** Admin only. Returns directory fields only: no hashes, tokens or encrypted PII. */
export async function GET(request: Request) {
  try {
    if (!(await requireAdmin())) return unauthorized();

    const params = new URL(request.url).searchParams;
    const search = (params.get("search") || "").trim().slice(0, 100);
    const page = Math.max(Number.parseInt(params.get("page") ?? "1", 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "10", 10) || 10, 1), 100);

    const where: Prisma.UserWhereInput = { role: { in: ["STUDENT", "STAFF", "SECURITY"] } };
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { uii: { contains: search, mode: "insensitive" } },
        { rruIdNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    const [members, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          uii: true,
          fullName: true,
          email: true,
          role: true,
          rruIdNumber: true,
          createdAt: true,
          assets: { select: { id: true, assetType: true, identifier: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      data: members,
      pagination: { totalCount, totalPages: Math.max(Math.ceil(totalCount / limit), 1), currentPage: page, limit },
    });
  } catch (error) {
    console.error("Error fetching members:", error);
    return errorJson("Failed to fetch members", 500);
  }
}

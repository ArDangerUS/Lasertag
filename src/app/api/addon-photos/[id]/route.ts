import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Public: serves the uploaded addon photo (URL carries ?v=<updatedAt>).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const blob = await prisma.addonPhotoBlob.findUnique({ where: { addonId: params.id } });
  if (!blob) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(blob.data), {
    headers: {
      "Content-Type": blob.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

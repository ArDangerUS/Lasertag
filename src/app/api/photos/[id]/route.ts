import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Public: serves the uploaded activity photo. Cached hard because the URL
// carries ?v=<updatedAt> — a new upload changes the URL.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const blob = await prisma.activityPhotoBlob.findUnique({ where: { activityId: params.id } });
  if (!blob) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(blob.data), {
    headers: {
      "Content-Type": blob.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

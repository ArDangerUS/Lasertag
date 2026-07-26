import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

// Upload (replace) the activity photo. multipart/form-data with a "file" field.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "editCatalog")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const activity = await prisma.activity.findUnique({
    where: { id: params.id },
    select: { id: true, nameUk: true },
  });
  if (!activity) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Очікується файл (form-data)" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Додайте файл у поле «file»" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Підтримуються лише JPG, PNG або WebP" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Файл завеликий (максимум 5 МБ)" }, { status: 400 });
  }

  const data = Buffer.from(await file.arrayBuffer());
  const blob = await prisma.activityPhotoBlob.upsert({
    where: { activityId: activity.id },
    create: { activityId: activity.id, data, mime: file.type },
    update: { data, mime: file.type },
  });

  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Розвага",
    entityId: activity.id,
    summary: `завантажив(-ла) фото для «${activity.nameUk}» (${Math.round(file.size / 1024)} КБ)`,
  });

  return NextResponse.json({
    ok: true,
    photoUrl: `/api/photos/${activity.id}?v=${blob.updatedAt.getTime()}`,
  });
}

// Remove the uploaded photo (the site falls back to the built-in
// /activities/<key>.jpg file if present).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "editCatalog")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const activity = await prisma.activity.findUnique({
    where: { id: params.id },
    select: { id: true, nameUk: true, photoBlob: { select: { activityId: true } } },
  });
  if (!activity) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (!activity.photoBlob) {
    return NextResponse.json({ error: "Завантаженого фото немає" }, { status: 404 });
  }

  await prisma.activityPhotoBlob.delete({ where: { activityId: activity.id } });
  await audit({
    actor: user,
    action: "DELETE",
    entity: "Розвага",
    entityId: activity.id,
    summary: `видалив(-ла) завантажене фото «${activity.nameUk}»`,
  });

  return NextResponse.json({ ok: true });
}

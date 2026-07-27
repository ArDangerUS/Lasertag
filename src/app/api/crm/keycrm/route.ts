import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { keycrmEnabled } from "@/lib/keycrm";

export const dynamic = "force-dynamic";

const apiBase = () => (process.env.KEYCRM_API_URL || "https://openapi.keycrm.app/v1").replace(/\/$/, "");

async function kget(path: string): Promise<any> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.KEYCRM_API_TOKEN}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Службова сторінка для адміністратора: показує воронки KeyCRM з колонками
// (статусами) та джерела разом з їхніми ID — щоб було що вписати в
// KEYCRM_PIPELINE_ID / KEYCRM_CANCEL_STATUS_ID / KEYCRM_SOURCE_ID.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "editCatalog")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!keycrmEnabled()) {
    return NextResponse.json(
      { error: "KEYCRM_API_TOKEN не задано — додайте токен у змінні середовища і відкрийте цю сторінку ще раз." },
      { status: 400 }
    );
  }

  try {
    const pipelines = await kget("/pipelines?limit=50");
    const pipelineRows = Array.isArray(pipelines?.data) ? pipelines.data : [];
    const detailed = [];
    for (const p of pipelineRows) {
      let statuses: any[] = [];
      try {
        const s = await kget(`/pipelines/${p.id}/statuses?limit=50`);
        statuses = Array.isArray(s?.data) ? s.data : [];
      } catch {
        // воронка без доступних статусів — пропускаємо
      }
      detailed.push({
        pipeline_id: p.id,
        назва: p.title ?? p.name ?? "",
        колонки: statuses.map((s) => ({ status_id: s.id, назва: s.title ?? s.name ?? "" })),
      });
    }

    let sources: any[] = [];
    try {
      const s = await kget("/order/source?limit=50");
      sources = Array.isArray(s?.data) ? s.data : [];
    } catch {
      // джерела можуть бути вимкнені — не критично
    }

    return NextResponse.json({
      підказка:
        "KEYCRM_PIPELINE_ID = pipeline_id потрібної воронки; KEYCRM_CANCEL_STATUS_ID = status_id колонки типу «Скасовано» в цій воронці; KEYCRM_SOURCE_ID = source_id (необовʼязково).",
      воронки: detailed,
      джерела: sources.map((s) => ({ source_id: s.id, назва: s.name ?? s.title ?? "" })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Не вдалося опитати KeyCRM: ${e?.message || e}` },
      { status: 502 }
    );
  }
}

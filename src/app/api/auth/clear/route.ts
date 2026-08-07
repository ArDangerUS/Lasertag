import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Clears a stale session cookie (e.g. after the DB was re-seeded and the user
// id in the JWT no longer exists) and sends the visitor to the login page.
// Without this, middleware (token valid) and the CRM layout (user missing)
// would bounce the request back and forth in an infinite 307 loop.
// Location — відносний, щоб за проксі хостингу не підставлявся внутрішній
// хост (localhost:3000).
export async function GET(req: NextRequest) {
  // PUBLIC_ORIGIN читається під час роботи (NEXT_PUBLIC_* «запікається» у збірку)
  const env = process.env.PUBLIC_ORIGIN;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto =
    req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "") || "https";
  const origin = env ? env.replace(/\/+$/, "") : host ? `${proto}://${host}` : req.nextUrl.origin;
  const res = NextResponse.redirect(new URL("/crm/login", origin));
  res.cookies.set("g75_session", "", { path: "/", maxAge: 0 });
  return res;
}

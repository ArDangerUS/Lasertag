import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Clears a stale session cookie (e.g. after the DB was re-seeded and the user
// id in the JWT no longer exists) and sends the visitor to the login page.
// Without this, middleware (token valid) and the CRM layout (user missing)
// would bounce the request back and forth in an infinite 307 loop.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/crm/login";
  url.search = "";
  const res = NextResponse.redirect(url);
  res.cookies.set("g75_session", "", { path: "/", maxAge: 0 });
  return res;
}

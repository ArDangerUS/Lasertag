import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "g75_session";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
  return new TextEncoder().encode(s);
}

// Зовнішня адреса сайту. За проксі хостингу req.nextUrl бачить внутрішній
// хост (localhost:3000), тому редиректи вели «в нікуди». Пріоритет:
// PUBLIC_ORIGIN (задається явно) → заголовки проксі → як прийшло.
function externalOrigin(req: NextRequest): string {
  // PUBLIC_ORIGIN читається під час роботи (NEXT_PUBLIC_* «запікається» у збірку)
  const env = process.env.PUBLIC_ORIGIN;
  if (env) return env.replace(/\/+$/, "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) {
    const proto =
      req.headers.get("x-forwarded-proto") ||
      req.nextUrl.protocol.replace(":", "") ||
      "https";
    return `${proto}://${host}`;
  }
  return req.nextUrl.origin;
}

function redirectTo(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, externalOrigin(req)));
}

// Protect the CRM. Everything under /crm requires a valid session except the
// login page and the auth API. The public booking site is open.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isLogin = pathname === "/crm/login";
  const token = req.cookies.get(COOKIE)?.value;

  let valid = false;
  if (token) {
    try {
      await jwtVerify(token, secret());
      valid = true;
    } catch {
      valid = false;
    }
  }

  if (!valid && !isLogin) {
    return redirectTo(req, `/crm/login?next=${encodeURIComponent(pathname)}`);
  }

  if (valid && isLogin) {
    return redirectTo(req, "/crm");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/crm/:path*"],
};

import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic route guard — checks only for the *presence* of the Better Auth
 * session cookie and redirects unauthenticated users away from protected
 * areas. The authoritative auth check still happens in the DAL (Server
 * Components / Server Actions), so this is a UX optimization, not the
 * security boundary.
 */
const PROTECTED_PREFIXES = ["/agency", "/coach"];
const AUTH_ONLY_PAGES = ["/login", "/setup"];

function hasSessionCookie(req: NextRequest): boolean {
  const cookies = req.cookies;
  return (
    !!cookies.get("better-auth.session_token")?.value ||
    !!cookies.get("__Secure-better-auth.session_token")?.value
  );
}

export default function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthOnly = AUTH_ONLY_PAGES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const authed = hasSessionCookie(req);

  if (isProtected && !authed) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isAuthOnly && authed && pathname !== "/setup") {
    return NextResponse.redirect(new URL("/coach", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

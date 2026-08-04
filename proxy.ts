import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic route guard — checks only for the *presence* of the Better Auth
 * session cookie and redirects unauthenticated users away from protected
 * areas. The authoritative auth check still happens in the DAL (Server
 * Components / Server Actions), so this is a UX optimization, not the
 * security boundary.
 */
const PROTECTED_PREFIXES = ["/bildungstraeger", "/coach"];

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
  const authed = hasSessionCookie(req);

  if (isProtected && !authed) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // Bewusst KEIN optimistisches „hat Cookie → weg von /login nach /coach" mehr.
  // Cookie-Präsenz ≠ gültige Session: ein Stale-/Deleted-Session-Cookie würde
  // sonst mit dem DAL pingpongen (Middleware schickt /login→/coach, das DAL
  // schickt /coach→/login → Endlosschleife, Chrome „Throttling navigation").
  // Die maßgebliche „schon eingeloggt?"-Entscheidung trifft die /login-Page
  // selbst über `loggedInRedirectTarget`, die die Session wirklich validiert.
  return NextResponse.next();
}

export const config = {
  // Nur bekannte Asset-Extensions vom Matcher ausschließen — sonst würden
  // künftig Routen wie /documents/file.pdf fälschlich nicht geguardet.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|css|js|ico|json|map|woff2?|ttf|otf)$).*)",
  ],
};

import { NextResponse, type NextRequest } from "next/server";
import { isKnownProgramSlug } from "@/lib/program-source";

/*
 * Proxy (runs before rendering). Two fast, early checks:
 *
 * 1. Protected areas (/student, /admin): visitors WITHOUT a session cookie are
 *    redirected to /login with a 307. This is only an optimisation for a
 *    clean redirect; it does not validate the cookie. The real checks are
 *    requireStudent()/requireAdmin()/authorizeApiRequest() in each page,
 *    Server Action and Route Handler (src/lib/auth/session.ts).
 *
 *    /checkout/:programSlug is protected the same way.
 *
 * 2. Unknown program URLs (/programs/:slug, /checkout/:slug): a real 404 status. Program pages are partially
 *    prerendered, so for a slug not generated at build time the static shell
 *    starts streaming (with a 200 status) before the page can call notFound().
 */

// Auth.js session cookie: "authjs.session-token", with a "__Secure-" prefix over HTTPS and ".N" suffixes when chunked.
const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/;

function isProtectedPath(pathname: string): boolean {
  return /^\/(student|admin|checkout)(\/|$)/.test(pathname);
}

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => SESSION_COOKIE.test(cookie.name));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isProtectedPath(pathname) && !hasSessionCookie(request)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  if (!pathname.startsWith("/programs/") && !pathname.startsWith("/checkout/")) return NextResponse.next();

  // /programs/:slug and /checkout/:slug
  const segment = pathname.split("/")[2] ?? "";
  let slug = "";
  try {
    slug = decodeURIComponent(segment);
  } catch {
    // Malformed percent-encoding: treat as unknown.
  }
  if (!(await isKnownProgramSlug(slug))) {
    return NextResponse.rewrite(new URL("/__program-not-found", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/programs/:slug", "/checkout/:slug", "/student", "/student/:path*", "/admin", "/admin/:path*"],
};

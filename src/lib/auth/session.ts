import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { auth } from "@/auth";
import type { UserRole } from "@/lib/constants";
import { isAuthConfigured } from "@/lib/env";
import { homePathForRole, loginPath } from "@/lib/auth/redirects";
import { DatabaseConnectionError } from "@/lib/db/mongodb";
import { findUserForSession } from "@/lib/services/auth-service";

/*
 * Data Access Layer for authentication: the ONLY place that turns a request
 * into a user. Every protected page, Server Action and Route Handler calls
 * these helpers itself; Proxy redirects are a convenience, not the security
 * boundary, and hiding links is never relied on.
 *
 * Trust model: the session cookie proves who the user is (signed and
 * encrypted with AUTH_SECRET). Role and account status come from the
 * database on every request, so role changes and disabled accounts apply
 * immediately. A session is rejected when its version no longer matches the
 * user's (logout, password reset or role change ended it).
 */

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
};

type SessionState = { user: CurrentUser | null; databaseUnavailable: boolean };

/**
 * Loads the session once per request. If the database cannot be reached, the
 * visitor is treated as signed out ("fail closed": nothing is granted), and
 * the outage is remembered so protected pages can say so instead of
 * redirecting to the login page.
 */
const loadSession = cache(async (): Promise<SessionState> => {
  // Always evaluate per request, even when auth is not configured at build
  // time; otherwise a "signed out" result could be prerendered into static HTML.
  await connection();
  if (!isAuthConfigured()) return { user: null, databaseUnavailable: false };

  const session = await auth();
  const id = session?.user?.id;
  const sessionVersion = session?.sessionVersion;
  if (!id || typeof sessionVersion !== "number") return { user: null, databaseUnavailable: false };

  let user;
  try {
    user = await findUserForSession(id);
  } catch (error) {
    if (!(error instanceof DatabaseConnectionError)) throw error;
    reportOutage();
    return { user: null, databaseUnavailable: true };
  }
  if (!user || user.accountStatus !== "active") return { user: null, databaseUnavailable: false };
  if ((user.sessionVersion ?? 0) !== sessionVersion) return { user: null, databaseUnavailable: false };

  return {
    user: { id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified !== null },
    databaseUnavailable: false,
  };
});

let lastOutageReport = 0;
function reportOutage() {
  // One line per minute at most, so an outage does not flood the log.
  if (Date.now() - lastOutageReport < 60_000) return;
  lastOutageReport = Date.now();
  console.error("[auth] Session check skipped: the database is unavailable (visitors are treated as signed out).");
}

/**
 * The signed-in, active user for this request, or null (also null while the
 * database is unavailable). Deduplicated per request with React cache(), so
 * several components can call it cheaply. Reads cookies, so callers must
 * render inside a <Suspense> boundary.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => (await loadSession()).user);

/** Thrown by protected pages during a database outage; shown by the error boundary. */
export class ServiceUnavailableError extends Error {
  constructor() {
    super("The service is temporarily unavailable. Please try again in a few minutes.");
    this.name = "ServiceUnavailableError";
  }
}

/** For pages: the current user, or a redirect to /login (returning to `returnTo` afterwards). */
export async function requireUser(returnTo?: string): Promise<CurrentUser> {
  const { user, databaseUnavailable } = await loadSession();
  // Not a login problem: do not send a signed-in person to the login page during an outage.
  if (databaseUnavailable) throw new ServiceUnavailableError();
  if (!user) redirect(loginPath(returnTo));
  return user;
}

/** For student pages: other roles are sent to their own dashboard. */
export async function requireStudent(returnTo = "/student"): Promise<CurrentUser> {
  const user = await requireUser(returnTo);
  if (user.role !== "student") redirect(homePathForRole(user.role));
  return user;
}

/** For admin pages: non-admins are sent to their own dashboard; nothing admin-only renders. */
export async function requireAdmin(returnTo = "/admin"): Promise<CurrentUser> {
  const user = await requireUser(returnTo);
  if (user.role !== "admin") redirect(homePathForRole(user.role));
  return user;
}

/**
 * For Route Handlers: the user, or a ready-made 401 (not signed in) or 403
 * (signed in without the required role) JSON response.
 */
export async function authorizeApiRequest(
  requiredRole?: UserRole,
): Promise<{ user: CurrentUser; response?: never } | { user?: never; response: Response }> {
  const headers = { "Cache-Control": "no-store" };
  const { user, databaseUnavailable } = await loadSession();
  if (databaseUnavailable) {
    return { response: Response.json({ error: "unavailable", message: "The service is temporarily unavailable." }, { status: 503, headers }) };
  }
  if (!user) return { response: Response.json({ error: "unauthorized" }, { status: 401, headers }) };
  if (requiredRole && user.role !== requiredRole) {
    return { response: Response.json({ error: "forbidden" }, { status: 403, headers }) };
  }
  return { user };
}

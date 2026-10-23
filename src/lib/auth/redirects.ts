import type { UserRole } from "@/lib/constants";

/*
 * Post-login redirect rules. Only same-site relative paths are accepted, so a
 * crafted ?callbackUrl= can never send someone to another domain.
 */

const BASE = "https://krushitech.invalid";
const NO_RETURN_PREFIXES = ["/login", "/register", "/forgot-password", "/reset-password", "/api", "/_next"];

export function homePathForRole(role: UserRole): string {
  return role === "admin" ? "/admin" : "/student";
}

/** Returns a normalised internal path, or null if the value is unsafe or unsuitable. */
export function getSafeRedirectPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  // Must be a root-relative path; reject protocol-relative (//evil) and backslash tricks (/\evil).
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null; // control characters

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;

  const path = `${url.pathname}${url.search}${url.hash}`;
  if (NO_RETURN_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) return null;
  return path;
}

function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin?") || path.startsWith("/admin#");
}

/**
 * Where to send a user after logging in: the requested page if it is safe
 * and permitted for their role (from the database, never the client),
 * otherwise their dashboard.
 */
export function postLoginRedirect(role: UserRole, requested: unknown): string {
  const path = getSafeRedirectPath(requested);
  if (!path || path === "/") return homePathForRole(role);
  if (role !== "admin" && isAdminPath(path)) return homePathForRole(role);
  return path;
}

export function loginPath(returnTo?: string): string {
  const safe = getSafeRedirectPath(returnTo);
  return safe ? `/login?callbackUrl=${encodeURIComponent(safe)}` : "/login";
}

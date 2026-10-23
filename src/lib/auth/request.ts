import "server-only";

/**
 * Best-effort client IP for rate limiting. Uses the first X-Forwarded-For
 * entry, which is only trustworthy when the app runs behind a proxy that sets
 * it (as managed hosts do). Never use this for authorization.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64);
}

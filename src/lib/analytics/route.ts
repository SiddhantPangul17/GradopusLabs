import "server-only";
import { json, unexpectedError } from "@/lib/api";
import { parseAnalyticsQuery, type AnalyticsQuery } from "@/lib/analytics/period";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { authorizeApiRequest } from "@/lib/auth/session";
import type { Actor } from "@/lib/services/authorization";

/**
 * Shared GET handler for /api/admin/analytics/*: signed-in ACTIVE admin only
 * (role and status read from the database), rate-limited, strict query
 * validation (only period/from/to/mode; unknown parameters are rejected, so no
 * operators, fields or collection names can be passed through). Responses are
 * aggregates, never cached (no-store).
 */
export async function analyticsGet(request: Request, run: (actor: Actor, query: AnalyticsQuery) => Promise<unknown>): Promise<Response> {
  const { user, response } = await authorizeApiRequest("admin");
  if (response) return response;

  const limit = await consumeRateLimit(RATE_LIMITS.analyticsApiPerAccount, user.id);
  if (!limit.allowed) return json({ error: "rate_limited", message: "Too many requests. Please wait a few minutes." }, 429);

  const parsed = parseAnalyticsQuery(Object.fromEntries(new URL(request.url).searchParams), new Date(), { strict: true });
  if (!parsed.ok) return json({ error: "invalid", message: parsed.message }, 400);
  try {
    const data = await run({ id: user.id, role: user.role }, parsed.query);
    return json({ period: parsed.query.period, mode: parsed.query.mode, data });
  } catch {
    return unexpectedError("analytics report");
  }
}

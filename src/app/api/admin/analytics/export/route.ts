import { json, unexpectedError } from "@/lib/api";
import { parseAnalyticsQuery } from "@/lib/analytics/period";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { authorizeApiRequest } from "@/lib/auth/session";
import { EXPORT_REPORTS, exportReport, type ExportReport } from "@/lib/services/analytics-export";

/**
 * GET /api/admin/analytics/export?report=<name>&period=…&from=…&to=…&mode=…
 * CSV download of an aggregated report (admins only, rate-limited, audited).
 * Same filters and boundaries as the pages. Never cached; no stored file URL.
 */
export async function GET(request: Request) {
  const { user, response } = await authorizeApiRequest("admin");
  if (response) return response;

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { report, ...rest } = params;
  if (!(EXPORT_REPORTS as readonly string[]).includes(report ?? "")) {
    return json({ error: "invalid", message: `report must be one of: ${EXPORT_REPORTS.join(", ")}.` }, 400);
  }
  const parsed = parseAnalyticsQuery(rest, new Date(), { strict: true });
  if (!parsed.ok) return json({ error: "invalid", message: parsed.message }, 400);

  const limit = await consumeRateLimit(RATE_LIMITS.analyticsExportPerAccount, user.id);
  if (!limit.allowed) return json({ error: "rate_limited", message: "Too many exports. Please wait a few minutes." }, 429);

  try {
    const result = await exportReport({ id: user.id, role: user.role }, report as ExportReport, parsed.query);
    return new Response(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Report-Rows": String(result.rows),
        ...(result.truncated ? { "X-Report-Truncated": "true" } : {}),
      },
    });
  } catch {
    return unexpectedError("analytics export");
  }
}

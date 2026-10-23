import "server-only";
import { parseAnalyticsQuery, type AnalyticsQuery } from "@/lib/analytics/period";
import type { SeriesPoint } from "@/lib/services/analytics-service";
import { formatMinorUnits } from "@/lib/utils";

type Search = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Page filters: invalid values fall back to the last 30 days with a visible message (APIs reject instead). */
export function resolveQuery(search: Search): { query: AnalyticsQuery; error: string | null } {
  const raw = { period: first(search.period), from: first(search.from), to: first(search.to), mode: first(search.mode) };
  const parsed = parseAnalyticsQuery(raw);
  if (parsed.ok) return { query: parsed.query, error: null };
  const fallback = parseAnalyticsQuery({ mode: raw.mode === "test" ? "test" : undefined });
  if (!fallback.ok) throw new Error("Default period failed");
  return { query: fallback.query, error: `${parsed.message} Showing the last 30 days instead.` };
}

export const count = (value: number) => new Intl.NumberFormat("en-IN").format(value);
export const money = (amount: number, currency: string) => formatMinorUnits(amount, currency);
export const percent = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`);

const UNIT: Record<string, string> = { day: "day", week: "week", month: "month" };

/** Plain-language summary of a series (the chart's accessible text). */
export function seriesSummary(points: SeriesPoint[], what: string, periodLabel: string, bucket: string, show: (value: number) => string = count): string {
  const total = points.reduce((sum, point) => sum + point.value, 0);
  if (total === 0) return `No ${what} in ${periodLabel.toLowerCase()}.`;
  const peak = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  return `${show(total)} ${what} in ${periodLabel.toLowerCase()}. Highest in one ${UNIT[bucket] ?? bucket}: ${show(peak.value)} (${peak.label}).`;
}

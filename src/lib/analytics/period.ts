import { z } from "zod";
import { brand } from "@/config/brand";

/*
 * Reporting periods (pure; shared by pages, APIs, exports and tests).
 *
 * - Timestamps are stored in UTC. Days are calendar days in the application
 *   time zone (brand.timeZone, Asia/Kolkata: no daylight saving).
 * - A period is HALF-OPEN: from (inclusive) … to (exclusive), both at local
 *   midnight. A record exactly at midnight belongs to the day that starts
 *   then, so nothing is counted twice at a boundary.
 * - Presets end at the end of today (local). "Last 7 days" = today and the 6
 *   days before it.
 * - Custom ranges are inclusive calendar dates, at most 366 days, not in the
 *   future, not before 2020.
 * - Buckets for charts: day (≤ 31 days), week (≤ 180 days, weeks start
 *   Monday), month (longer, and "all time").
 */

export const TIME_ZONE = brand.timeZone;
export const PERIOD_PRESETS = ["today", "7d", "30d", "90d", "365d", "all", "custom"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export type Bucket = "day" | "week" | "month";
export const MAX_CUSTOM_DAYS = 366;
const EARLIEST = "2020-01-01";

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "365d": "Last 365 days",
  all: "All time",
  custom: "Custom range",
};

export type Period = {
  preset: PeriodPreset;
  /** Inclusive start (UTC instant of local midnight); null for "all time". */
  from: Date | null;
  /** Exclusive end (UTC instant of local midnight after the last day). */
  to: Date;
  /** Local calendar dates, inclusive, for display and links. */
  fromDate: string | null;
  toDate: string;
  bucket: Bucket;
  label: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const analyticsQuerySchema = z
  .object({
    period: z.enum(PERIOD_PRESETS).default("30d"),
    from: z.string().regex(DATE, "Use YYYY-MM-DD.").optional(),
    to: z.string().regex(DATE, "Use YYYY-MM-DD.").optional(),
    mode: z.enum(["live", "test"]).default("live"),
  })
  .strict();

export type AnalyticsQuery = { period: Period; mode: "live" | "test" };

/** Local Y-M-D of an instant. */
export function localDate(at: Date, timeZone = TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function offsetMinutes(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")!.value; // "GMT+05:30" or "GMT"
  const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
}

/** UTC instant of local midnight at the start of a local calendar date. */
export function startOfLocalDay(date: string, timeZone = TIME_ZONE): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return new Date(guess - offsetMinutes(new Date(guess), timeZone) * 60_000);
}

/** Calendar arithmetic on YYYY-MM-DD (time-zone independent). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isRealDate(date: string): boolean {
  return DATE.test(date) && addDays(date, 0) === date;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function bucketFor(days: number | null): Bucket {
  if (days === null || days > 180) return "month";
  return days > 31 ? "week" : "day";
}

export type PeriodResult = { ok: true; query: AnalyticsQuery } | { ok: false; message: string };

/** Validates raw query values (strings from a URL) into a bounded period. */
export function parseAnalyticsQuery(raw: Record<string, string | undefined>, now = new Date(), options: { strict?: boolean } = {}): PeriodResult {
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined && value !== ""));
  const parsed = (options.strict ? analyticsQuerySchema : analyticsQuerySchema.strip()).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid report parameters." };
  const { period: preset, mode } = parsed.data;

  const today = localDate(now);
  const end = addDays(today, 1);
  const presetDays: Partial<Record<PeriodPreset, number>> = { today: 1, "7d": 7, "30d": 30, "90d": 90, "365d": 365 };

  if (preset === "all") {
    return { ok: true, query: { mode, period: { preset, from: null, to: startOfLocalDay(end), fromDate: null, toDate: today, bucket: "month", label: PRESET_LABELS.all } } };
  }
  if (preset !== "custom") {
    const days = presetDays[preset]!;
    const fromDate = addDays(today, -(days - 1));
    return {
      ok: true,
      query: { mode, period: { preset, from: startOfLocalDay(fromDate), to: startOfLocalDay(end), fromDate, toDate: today, bucket: bucketFor(days), label: PRESET_LABELS[preset] } },
    };
  }

  const { from, to } = parsed.data;
  if (!from || !to) return { ok: false, message: "Choose both a start and an end date." };
  if (!isRealDate(from) || !isRealDate(to)) return { ok: false, message: "Those are not valid dates." };
  if (from > to) return { ok: false, message: "The start date must be on or before the end date." };
  if (to > today) return { ok: false, message: "The end date cannot be in the future." };
  if (from < EARLIEST) return { ok: false, message: `Dates before ${EARLIEST} are not supported.` };
  const days = daysBetween(from, to) + 1;
  if (days > MAX_CUSTOM_DAYS) return { ok: false, message: `Custom ranges can be at most ${MAX_CUSTOM_DAYS} days. Use "All time" for longer views.` };
  return {
    ok: true,
    query: {
      mode,
      period: { preset, from: startOfLocalDay(from), to: startOfLocalDay(addDays(to, 1)), fromDate: from, toDate: to, bucket: bucketFor(days), label: `${from} to ${to}` },
    },
  };
}

/** Mongo filter for a date field within the period (half-open). */
export function inPeriod(period: Period): { $gte?: Date; $lt: Date } {
  return period.from ? { $gte: period.from, $lt: period.to } : { $lt: period.to };
}

/** The local start date (YYYY-MM-DD) of the bucket containing a local date. Matches Mongo $dateTrunc (weeks start Monday). */
export function bucketKey(date: string, bucket: Bucket): string {
  if (bucket === "day") return date;
  if (bucket === "month") return `${date.slice(0, 7)}-01`;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

function nextBucket(key: string, bucket: Bucket): string {
  if (bucket === "day") return addDays(key, 1);
  if (bucket === "week") return addDays(key, 7);
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/** Every bucket key in the period, oldest first (for "all time", from the first data point). Capped. */
export function bucketKeys(period: Period, firstDataDate: string | null, cap = 400): string[] {
  const start = period.fromDate ?? firstDataDate;
  if (!start) return [];
  const keys: string[] = [];
  for (let key = bucketKey(start, period.bucket); key <= period.toDate && keys.length < cap; key = nextBucket(key, period.bucket)) keys.push(key);
  return keys;
}

/** Query-string for links that keep the current filters. */
export function periodSearch(query: AnalyticsQuery, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ period: query.period.preset, ...extra });
  if (query.period.preset === "custom" && query.period.fromDate) {
    params.set("from", query.period.fromDate);
    params.set("to", query.period.toDate);
  }
  if (query.mode === "test") params.set("mode", "test");
  return params.toString();
}

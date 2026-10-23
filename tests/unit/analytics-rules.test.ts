import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/analytics/csv";
import { bucketKey, bucketKeys, inPeriod, localDate, parseAnalyticsQuery, startOfLocalDay } from "@/lib/analytics/period";

const NOW = new Date("2026-10-20T10:00:00Z"); // 15:30 IST, 20 Oct 2026

function period(raw: Record<string, string | undefined>, strict = false) {
  const result = parseAnalyticsQuery(raw, NOW, { strict });
  if (!result.ok) throw new Error(result.message);
  return result.query.period;
}

describe("reporting periods", () => {
  it("uses India-time calendar days as half-open UTC ranges", () => {
    expect(startOfLocalDay("2026-10-20").toISOString()).toBe("2026-10-19T18:30:00.000Z");
    expect(localDate(new Date("2026-10-19T18:29:59.999Z"))).toBe("2026-10-19");
    expect(localDate(new Date("2026-10-19T18:30:00.000Z"))).toBe("2026-10-20");
    const today = period({ period: "today" });
    expect(today.from?.toISOString()).toBe("2026-10-19T18:30:00.000Z");
    expect(today.to.toISOString()).toBe("2026-10-20T18:30:00.000Z");
    expect(inPeriod(today)).toEqual({ $gte: today.from, $lt: today.to });
  });

  it("presets include today and the days before it", () => {
    const week = period({ period: "7d" });
    expect(week.fromDate).toBe("2026-10-14");
    expect(week.toDate).toBe("2026-10-20");
    expect(week.bucket).toBe("day");
    expect(period({ period: "90d" }).bucket).toBe("week");
    expect(period({ period: "365d" }).bucket).toBe("month");
    const all = period({ period: "all" });
    expect(all.from).toBeNull();
    expect(inPeriod(all)).toEqual({ $lt: all.to });
    expect(period({}).preset).toBe("30d"); // default
  });

  it("consecutive periods share boundaries, so nothing is counted twice", () => {
    const a = period({ period: "custom", from: "2025-03-01", to: "2025-03-15" });
    const b = period({ period: "custom", from: "2025-03-16", to: "2025-03-31" });
    expect(a.to.getTime()).toBe(b.from!.getTime());
  });

  it("validates custom ranges server-side", () => {
    const bad = (raw: Record<string, string | undefined>) => parseAnalyticsQuery(raw, NOW);
    expect(bad({ period: "custom" })).toMatchObject({ ok: false });
    expect(bad({ period: "custom", from: "2025-02-30", to: "2025-03-01" })).toMatchObject({ ok: false });
    expect(bad({ period: "custom", from: "2025-03-10", to: "2025-03-01" })).toMatchObject({ ok: false });
    expect(bad({ period: "custom", from: "2026-10-01", to: "2026-10-21" })).toMatchObject({ ok: false }); // future
    expect(bad({ period: "custom", from: "2019-12-31", to: "2020-01-05" })).toMatchObject({ ok: false });
    expect(bad({ period: "custom", from: "2024-01-01", to: "2025-01-02" })).toMatchObject({ ok: false }); // > 366 days
    expect(bad({ period: "custom", from: "2024-01-01", to: "2024-12-31" })).toMatchObject({ ok: true }); // 366 days (leap year)
    expect(bad({ period: "forever" })).toMatchObject({ ok: false });
    expect(bad({ period: "custom", from: "2025-03-01T00:00", to: "2025-03-02" })).toMatchObject({ ok: false });
    expect(bad({ mode: "sandbox" })).toMatchObject({ ok: false });
  });

  it("strict mode (APIs) rejects unknown parameters, such as query operators", () => {
    expect(parseAnalyticsQuery({ period: "7d", $where: "1" }, NOW, { strict: true })).toMatchObject({ ok: false });
    expect(parseAnalyticsQuery({ period: "7d", collection: "users" }, NOW, { strict: true })).toMatchObject({ ok: false });
    expect(parseAnalyticsQuery({ period: "7d", collection: "users" }, NOW)).toMatchObject({ ok: true }); // pages ignore extras
  });

  it("buckets match MongoDB $dateTrunc (weeks start Monday) and cover the whole period", () => {
    expect(bucketKey("2026-10-18", "week")).toBe("2026-10-12"); // Sunday → previous Monday
    expect(bucketKey("2026-10-19", "week")).toBe("2026-10-19"); // Monday
    expect(bucketKey("2026-10-20", "month")).toBe("2026-10-01");
    const week = period({ period: "7d" });
    expect(bucketKeys(week, null)).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"]);
    expect(bucketKeys(period({ period: "all" }), null)).toEqual([]);
    expect(bucketKeys(period({ period: "all" }), "2026-08-15")).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
  });
});

describe("CSV export safety", () => {
  it("neutralises spreadsheet formulas in text cells", () => {
    for (const value of ["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
      expect(csvCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell("Web Basics")).toBe("Web Basics");
    expect(csvCell(-5)).toBe("-5"); // numbers stay numbers
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell('Say "hi", then\nleave')).toBe('"Say ""hi"", then\nleave"');
    expect(toCsv(["a", "b"], [["x,y", 2]])).toBe('﻿a,b\r\n"x,y",2\r\n');
  });
});

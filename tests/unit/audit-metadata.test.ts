import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "@/lib/services/audit-log";

describe("sanitizeAuditMetadata", () => {
  it("removes sensitive keys at any depth", () => {
    const result = sanitizeAuditMetadata({
      slug: "web-basics",
      password: "hunter2",
      passwordHash: "$2b$...",
      accessToken: "abc",
      payment: { cardNumber: "4111111111111111", cvv: "123", amount: 9900 },
      session: "s",
      $where: "1",
    });
    expect(result).toEqual({ slug: "web-basics", payment: { amount: 9900 } });
  });

  it("converts ids and dates, drops functions and bounds size", () => {
    const id = new Types.ObjectId();
    const date = new Date("2026-01-01T00:00:00Z");
    expect(sanitizeAuditMetadata({ id, date, fn: () => 1 })).toEqual({ id: id.toString(), date: date.toISOString() });
    expect(sanitizeAuditMetadata({ big: Array.from({ length: 20 }, () => "x".repeat(500)) })).toEqual({ truncated: true });
  });
});

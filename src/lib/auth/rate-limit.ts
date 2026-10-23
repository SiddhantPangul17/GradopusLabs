import "server-only";
import { createHash } from "node:crypto";
import { connectToDatabase } from "@/lib/db/mongodb";
import { isDuplicateKeyError } from "@/lib/errors";
import { RateLimitModel } from "@/models/rate-limit";

/*
 * Fixed-window rate limiting backed by MongoDB, so limits hold across every
 * server instance (including serverless). Counters are keyed by a SHA-256
 * hash of the identifier; raw IPs and emails are never stored.
 *
 * Limits are deliberately simple. For high traffic, a dedicated store
 * (e.g. Redis) or the hosting provider's WAF is the better long-term option.
 */

export type RateLimitRule = {
  /** Distinguishes limiters, e.g. "login:ip". */
  scope: string;
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMITS = {
  loginPerIp: { scope: "login:ip", limit: 30, windowSeconds: 15 * 60 },
  loginPerAccount: { scope: "login:account", limit: 8, windowSeconds: 15 * 60 },
  registerPerIp: { scope: "register:ip", limit: 5, windowSeconds: 60 * 60 },
  passwordResetPerIp: { scope: "reset:ip", limit: 10, windowSeconds: 60 * 60 },
  passwordResetPerAccount: { scope: "reset:account", limit: 3, windowSeconds: 60 * 60 },
  passwordChangePerAccount: { scope: "password-change:account", limit: 5, windowSeconds: 15 * 60 },
  checkoutPerAccount: { scope: "checkout:account", limit: 10, windowSeconds: 15 * 60 },
  paymentVerifyPerAccount: { scope: "payment-verify:account", limit: 30, windowSeconds: 15 * 60 },
  paymentReconcilePerAccount: { scope: "payment-reconcile:account", limit: 20, windowSeconds: 15 * 60 },
  certificateVerifyPerIp: { scope: "certificate-verify:ip", limit: 60, windowSeconds: 15 * 60 },
  analyticsApiPerAccount: { scope: "analytics-api:account", limit: 300, windowSeconds: 15 * 60 },
  analyticsExportPerAccount: { scope: "analytics-export:account", limit: 30, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Counts one attempt and reports whether it is within the limit. */
export async function consumeRateLimit(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs);
  const key = hashKey(`${rule.scope}|${identifier}|${windowStart}`);

  await connectToDatabase();
  const increment = () =>
    RateLimitModel.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: "after", lean: true },
    );

  let doc;
  try {
    doc = await increment();
  } catch (error) {
    // Two concurrent first attempts can race on the upsert; the retry increments the winner's document.
    if (!isDuplicateKeyError(error)) throw error;
    doc = await increment();
  }

  const count = doc?.count ?? 1;
  return {
    allowed: count <= rule.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

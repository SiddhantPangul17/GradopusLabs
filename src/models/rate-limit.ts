import "server-only";
import { model, models, Schema, type Model } from "mongoose";

/*
 * Fixed-window rate-limit counters, shared by every server instance because
 * they live in MongoDB. `key` is a SHA-256 hash, so no email addresses or IP
 * addresses are stored in plain text. Expired windows are removed by a TTL index.
 */

export type RateLimitRecord = {
  key: string;
  count: number;
  expiresAt: Date;
};

const rateLimitSchema = new Schema<RateLimitRecord>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { strict: "throw", collection: "rate_limits", versionKey: false },
);

rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitModel: Model<RateLimitRecord> =
  (models.RateLimit as Model<RateLimitRecord> | undefined) ?? model<RateLimitRecord>("RateLimit", rateLimitSchema);

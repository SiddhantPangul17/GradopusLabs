import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import { EMAIL_JOB_STATUSES, EMAIL_TYPES, type EmailJobStatus, type EmailType } from "@/lib/constants";

/*
 * Email outbox. A job is queued right after a business action succeeds and is
 * delivered by the outbox processor (src/lib/email/outbox.ts), so a slow or
 * failing email provider never blocks or reverses payments, enrolments,
 * reviews or certificates.
 *
 * Privacy: the recipient is stored as a user id (the address is looked up at
 * send time), `data` holds only small non-sensitive values needed to render
 * the message, and no message bodies, tokens or provider responses are kept.
 * Old jobs are removed after 180 days (TTL index).
 */

export type EmailJobRecord = {
  type: EmailType;
  /** Recipient account. Password-reset jobs also use the account (the token itself is never stored). */
  userId: Types.ObjectId;
  relatedEntityType: string | null;
  relatedEntityId: Types.ObjectId | null;
  /** Small, non-sensitive values captured at queue time (e.g. the review decision). */
  data: Record<string, string | number | null>;
  /** One job per business event, e.g. "payment_confirmation:<paymentId>". */
  idempotencyKey: string;
  status: EmailJobStatus;
  attemptCount: number;
  nextAttemptAt: Date;
  /** While "processing": the lease after which another worker may take over (crash recovery). */
  lockedUntil: Date | null;
  /** Not sent after this time: the job is cancelled (a stale email is worse than none). */
  expiresAt: Date;
  /** Short, safe code (e.g. "rate_limit_exceeded", "recipient_missing"); never a provider message. */
  lastErrorCode: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const emailJobSchema = new Schema<EmailJobRecord>(
  {
    type: { type: String, enum: EMAIL_TYPES, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    relatedEntityType: { type: String, default: null, maxlength: 40 },
    relatedEntityId: { type: Schema.Types.ObjectId, default: null },
    data: { type: Schema.Types.Mixed, default: {} },
    idempotencyKey: { type: String, required: true, maxlength: 200 },
    status: { type: String, enum: EMAIL_JOB_STATUSES, required: true, default: "pending" },
    attemptCount: { type: Number, required: true, default: 0, min: 0 },
    nextAttemptAt: { type: Date, required: true, default: () => new Date() },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    lastErrorCode: { type: String, default: null, maxlength: 64 },
    providerMessageId: { type: String, default: null, maxlength: 100 },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true, strict: "throw", collection: "email_jobs", minimize: false },
);

emailJobSchema.index({ idempotencyKey: 1 }, { unique: true, name: "unique_email_job" });
// The processor's queue: due pending jobs, oldest first.
emailJobSchema.index({ status: 1, nextAttemptAt: 1 });
emailJobSchema.index({ status: 1, createdAt: -1 });
emailJobSchema.index({ createdAt: -1 });
// Retention: delete jobs 180 days after creation.
emailJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60, name: "retention" });

export const EmailJobModel: Model<EmailJobRecord> =
  (models.EmailJob as Model<EmailJobRecord> | undefined) ?? model<EmailJobRecord>("EmailJob", emailJobSchema);

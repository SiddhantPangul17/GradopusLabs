import "server-only";
import { Types } from "mongoose";
import { EMAIL_JOB_STATUSES, EMAIL_TYPES, type EmailJobStatus, type EmailType } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { scheduleOutboxProcessing } from "@/lib/email/outbox";
import { recordAuditEvent } from "@/lib/services/audit-log";
import { assertAdmin, type Actor } from "@/lib/services/authorization";
import { fail, type ServiceResult } from "@/lib/services/result";
import { isValidObjectIdString } from "@/lib/validation/common";
import { EmailJobModel } from "@/models/email-job";
import { UserModel } from "@/models/user";

/*
 * Read-only email outbox monitoring for administrators, plus a "retry" for
 * failed jobs that re-queues the SAME job (same idempotency key), so a retry
 * can never send a second copy of an email the provider already accepted.
 * There is no way to compose or send arbitrary emails from the dashboard.
 */

export const EMAIL_JOBS_PAGE_SIZE = 25;

export type EmailJobItem = {
  id: string;
  type: EmailType;
  status: EmailJobStatus;
  recipient: { name: string; email: string };
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: string;
  nextAttemptAt: string;
  sentAt: string | null;
  expiresAt: string;
  retryable: boolean;
};

export async function listEmailJobs(actor: Actor, filters: { status?: string; type?: string; page?: number } = {}) {
  assertAdmin(actor);
  await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (filters.status && (EMAIL_JOB_STATUSES as readonly string[]).includes(filters.status)) query.status = filters.status;
  if (filters.type && (EMAIL_TYPES as readonly string[]).includes(filters.type)) query.type = filters.type;

  const [total, counts] = await Promise.all([
    EmailJobModel.countDocuments(query),
    EmailJobModel.aggregate<{ _id: EmailJobStatus; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / EMAIL_JOBS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1) || 1), totalPages);
  const docs = await EmailJobModel.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * EMAIL_JOBS_PAGE_SIZE)
    .limit(EMAIL_JOBS_PAGE_SIZE)
    .lean();
  const users = await UserModel.find({ _id: { $in: docs.map((doc) => doc.userId) } }).select("name email").lean();
  const userBy = new Map(users.map((user) => [user._id.toString(), user]));
  const now = Date.now();

  return {
    total,
    page,
    totalPages,
    counts: Object.fromEntries(EMAIL_JOB_STATUSES.map((status) => [status, counts.find((item) => item._id === status)?.count ?? 0])) as Record<
      EmailJobStatus,
      number
    >,
    items: docs.map((doc): EmailJobItem => {
      const user = userBy.get(doc.userId.toString());
      return {
        id: doc._id.toString(),
        type: doc.type,
        status: doc.status,
        recipient: { name: user?.name ?? "Deleted account", email: user?.email ?? "" },
        attemptCount: doc.attemptCount,
        lastErrorCode: doc.lastErrorCode,
        createdAt: doc.createdAt.toISOString(),
        nextAttemptAt: doc.nextAttemptAt.toISOString(),
        sentAt: doc.sentAt?.toISOString() ?? null,
        expiresAt: doc.expiresAt.toISOString(),
        retryable: doc.status === "failed" && doc.type !== "password_reset" && doc.expiresAt.getTime() > now,
      };
    }),
  };
}

/** Re-queues a failed job (same job, same idempotency key). Audited. */
export async function retryEmailJob(actor: Actor, jobId: string): Promise<ServiceResult<null>> {
  assertAdmin(actor);
  if (!isValidObjectIdString(jobId)) return fail("not_found", "Email job not found.");
  await connectToDatabase();
  const job = await EmailJobModel.findOneAndUpdate(
    { _id: jobId, status: "failed", type: { $ne: "password_reset" }, expiresAt: { $gt: new Date() } },
    { $set: { status: "pending", attemptCount: 0, nextAttemptAt: new Date(), lastErrorCode: null, lockedUntil: null } },
    { returnDocument: "after" },
  ).lean();
  if (!job) return fail("conflict", "Only failed, unexpired jobs can be retried (password-reset emails cannot: ask the person to request a new link).");
  await recordAuditEvent({
    actorId: actor.id,
    action: "email.retried",
    entityType: "email_job",
    entityId: new Types.ObjectId(jobId),
    metadata: { type: job.type },
  });
  scheduleOutboxProcessing();
  return { ok: true, data: null };
}

import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { Types } from "mongoose";
import { brand } from "@/config/brand";
import type { EmailType } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { getEmailConfig, siteLink } from "@/lib/email/config";
import { createEmailProvider, EmailPermanentError, EmailTransientError, type EmailProvider } from "@/lib/email/provider";
import {
  certificateIssuedEmail,
  certificateReplacedEmail,
  certificateRevokedEmail,
  enrollmentConfirmationEmail,
  passwordResetEmail,
  paymentConfirmationEmail,
  submissionReviewedEmail,
  welcomeEmail,
  type RenderedEmail,
} from "@/lib/email/templates";
import { isDuplicateKeyError } from "@/lib/errors";
import { formatMinorUnits } from "@/lib/utils";
import { CertificateModel } from "@/models/certificate";
import { EmailJobModel, type EmailJobRecord } from "@/models/email-job";
import { EnrollmentModel } from "@/models/enrollment";
import { LearningTaskModel } from "@/models/learning-task";
import { PaymentModel } from "@/models/payment";
import { ProgramModel } from "@/models/program";
import { SubmissionModel } from "@/models/submission";
import { UserModel } from "@/models/user";

/*
 * Email outbox (see docs/notifications.md).
 *
 * 1. Business services call enqueueEmail() AFTER their own write succeeded.
 *    One job per event (unique idempotency key), so repeated webhooks or
 *    retries never queue a second email. enqueueEmail never throws: an email
 *    problem can never undo a payment, enrolment, review or certificate.
 * 2. processEmailOutbox() delivers due jobs. It runs after the response
 *    (Next.js after()) and from the authenticated scheduled endpoint
 *    POST /api/notifications/process, because a serverless function is not
 *    guaranteed to stay alive after responding.
 * 3. Jobs are claimed with a lease (compare-and-set), so two workers never
 *    send the same job at once; a crashed worker's job is retried after the
 *    lease expires. Each job uses the same provider idempotency key on every
 *    attempt, so an unclear failure followed by a retry is not delivered twice.
 * 4. Transient failures retry with exponential backoff (bounded; all within
 *    the provider's 24-hour idempotency window). Permanent failures stop.
 *    "sent" means the provider ACCEPTED the message, not that it reached an inbox.
 * Messages are rendered at send time from current records; no bodies are stored.
 */

type Id = Types.ObjectId;
type JobDoc = EmailJobRecord & { _id: Id };

export const MAX_ATTEMPTS = 5;
/** Delay before attempt n+1 after a temporary failure of attempt n. Total < 3 hours. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const LEASE_MS = 2 * 60_000;
const DEFAULT_TTL_HOURS = 72;

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: brand.timeZone });

// ---------- Queueing ----------

export type EnqueueInput = {
  type: Exclude<EmailType, "password_reset">;
  userId: string | Id;
  idempotencyKey: string;
  relatedEntityType?: string;
  relatedEntityId?: string | Id;
  data?: Record<string, string | number | null>;
  ttlHours?: number;
};

/** Queues one email for a business event. Idempotent; never throws. */
export async function enqueueEmail(input: EnqueueInput): Promise<void> {
  try {
    await connectToDatabase();
    await EmailJobModel.create({
      type: input.type,
      userId: new Types.ObjectId(String(input.userId)),
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ? new Types.ObjectId(String(input.relatedEntityId)) : null,
      data: input.data ?? {},
      idempotencyKey: input.idempotencyKey,
      status: "pending",
      nextAttemptAt: new Date(),
      expiresAt: new Date(Date.now() + (input.ttlHours ?? DEFAULT_TTL_HOURS) * 3_600_000),
    });
    scheduleOutboxProcessing();
  } catch (error) {
    if (isDuplicateKeyError(error)) return; // already queued for this event
    console.error(`[email] could not queue a ${input.type} email`);
  }
}

/** Runs fn after the response is sent (Next.js after()); outside a request it simply runs it. */
export function runAfterResponse(fn: () => Promise<unknown>): void {
  const task = () => fn().catch(() => console.error("[email] background delivery failed"));
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Best-effort immediate delivery; the scheduled processor is the reliable path. */
export function scheduleOutboxProcessing(): void {
  if (getEmailConfig().status !== "ready") return;
  runAfterResponse(() => processEmailOutbox({ limit: 10 }));
}

// ---------- Processing ----------

export type ProcessResult = { configured: boolean; sent: number; retrying: number; failed: number; cancelled: number };

export async function processEmailOutbox(options: { limit?: number } = {}): Promise<ProcessResult> {
  const result: ProcessResult = { configured: false, sent: 0, retrying: 0, failed: 0, cancelled: 0 };
  const config = getEmailConfig();
  if (config.status !== "ready") return result; // jobs wait; nothing is marked sent
  result.configured = true;
  const provider = createEmailProvider(config);
  await connectToDatabase();

  for (let index = 0; index < (options.limit ?? 25); index++) {
    const job = await claimNextJob();
    if (!job) break;
    const outcome = await deliver(job, provider);
    result[outcome] += 1;
  }
  return result;
}

async function claimNextJob(): Promise<JobDoc | null> {
  const now = new Date();
  return EmailJobModel.findOneAndUpdate(
    {
      $or: [
        { status: "pending", nextAttemptAt: { $lte: now } },
        { status: "processing", lockedUntil: { $lt: now } }, // lease expired (crashed worker)
      ],
    },
    { $set: { status: "processing", lockedUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attemptCount: 1 } },
    { sort: { nextAttemptAt: 1 }, returnDocument: "after" },
  ).lean<JobDoc>();
}

/** Updates only if this worker still holds the lease. */
function finish(job: JobDoc, update: Record<string, unknown>) {
  return EmailJobModel.updateOne({ _id: job._id, status: "processing", lockedUntil: job.lockedUntil }, { $set: { lockedUntil: null, ...update } });
}

async function deliver(job: JobDoc, provider: EmailProvider): Promise<"sent" | "retrying" | "failed" | "cancelled"> {
  if (job.expiresAt.getTime() < Date.now()) {
    await finish(job, { status: "cancelled", lastErrorCode: "expired" });
    return "cancelled";
  }
  let prepared: Prepared;
  try {
    prepared = await prepareJob(job);
  } catch {
    prepared = { kind: "retry", code: "render_error" };
  }
  if (prepared.kind === "cancel") {
    await finish(job, { status: "cancelled", lastErrorCode: prepared.code });
    return "cancelled";
  }
  if (prepared.kind === "fail") {
    await finish(job, { status: "failed", lastErrorCode: prepared.code });
    return "failed";
  }
  if (prepared.kind === "send") {
    try {
      const { id } = await provider.send({ ...prepared.email, to: prepared.to, idempotencyKey: `krushitech-email-${job._id.toString()}` });
      await finish(job, { status: "sent", sentAt: new Date(), providerMessageId: id, lastErrorCode: null });
      return "sent";
    } catch (error) {
      if (error instanceof EmailPermanentError) {
        await finish(job, { status: "failed", lastErrorCode: error.code });
        return "failed";
      }
      prepared = { kind: "retry", code: error instanceof EmailTransientError ? error.code : "unexpected_error" };
    }
  }
  // Temporary problem: retry later, a bounded number of times.
  if (job.attemptCount >= MAX_ATTEMPTS) {
    await finish(job, { status: "failed", lastErrorCode: prepared.code });
    return "failed";
  }
  const delay = BACKOFF_MS[Math.min(job.attemptCount - 1, BACKOFF_MS.length - 1)];
  await finish(job, { status: "pending", nextAttemptAt: new Date(Date.now() + delay), lastErrorCode: prepared.code });
  return "retrying";
}

// ---------- Rendering from current records ----------

type Prepared =
  | { kind: "send"; to: string; email: RenderedEmail }
  | { kind: "cancel"; code: string }
  | { kind: "fail"; code: string }
  | { kind: "retry"; code: string };

const OUTCOME_LABEL: Record<string, string> = {
  accepted: "Accepted",
  changes_requested: "Changes requested",
  rejected: "Not accepted",
};

/** A strict, header-safe recipient address. */
function validRecipient(email: unknown): string | null {
  return typeof email === "string" && email.length <= 254 && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(email) ? email : null;
}

async function prepareJob(job: JobDoc): Promise<Prepared> {
  const user = await UserModel.findById(job.userId).select("name email").lean();
  const to = validRecipient(user?.email);
  if (!user || !to) return { kind: "fail", code: "recipient_missing" };
  const id = job.relatedEntityId;

  switch (job.type) {
    case "welcome":
      return { kind: "send", to, email: welcomeEmail({ name: user.name, loginUrl: siteLink("/login"), programsUrl: siteLink("/programs") }) };

    case "payment_confirmation": {
      const payment = id ? await PaymentModel.findById(id).lean() : null;
      // Re-checked at send time: only a verified, still-paid payment is confirmed.
      if (!payment || payment.status !== "paid" || !payment.paidAt) return { kind: "cancel", code: "not_applicable" };
      const program = await ProgramModel.findById(payment.programId).select("title").lean();
      return {
        kind: "send",
        to,
        email: paymentConfirmationEmail({
          name: user.name,
          programTitle: program?.title ?? "your program",
          amount: formatMinorUnits(payment.amount, payment.currency),
          reference: payment.providerPaymentId ?? payment.providerOrderId ?? payment._id.toString(),
          paidAt: DATE.format(payment.paidAt),
          link: siteLink(payment.enrollmentId ? `/student/programs/${payment.enrollmentId}` : "/student/payments"),
          linkLabel: payment.enrollmentId ? "Go to your program" : "View your payments",
        }),
      };
    }

    case "enrollment_confirmation": {
      const enrollment = id ? await EnrollmentModel.findById(id).lean() : null;
      if (!enrollment || (enrollment.status !== "active" && enrollment.status !== "completed")) return { kind: "cancel", code: "not_applicable" };
      const program = await ProgramModel.findById(enrollment.programId).select("title").lean();
      return {
        kind: "send",
        to,
        email: enrollmentConfirmationEmail({ name: user.name, programTitle: program?.title ?? "your program", link: siteLink(`/student/programs/${enrollment._id}`) }),
      };
    }

    case "submission_reviewed": {
      const submission = id ? await SubmissionModel.findById(id).lean() : null;
      // Only the decision that was persisted (and is still current) is reported.
      if (!submission || submission.status !== job.data.status || !OUTCOME_LABEL[submission.status]) return { kind: "cancel", code: "not_applicable" };
      const [task, program] = await Promise.all([
        LearningTaskModel.findById(submission.taskId).select("title").lean(),
        ProgramModel.findById(submission.programId).select("title").lean(),
      ]);
      return {
        kind: "send",
        to,
        email: submissionReviewedEmail({
          name: user.name,
          programTitle: program?.title ?? "your program",
          taskTitle: task?.title ?? "your task",
          outcome: OUTCOME_LABEL[submission.status],
          feedback: submission.feedback || null,
          link: siteLink(`/student/tasks/${submission.taskId}#attempt-${submission.attempt}`),
        }),
      };
    }

    case "certificate_issued": {
      const certificate = id ? await CertificateModel.findById(id).lean() : null;
      if (!certificate || certificate.status !== "issued") return { kind: "cancel", code: "not_applicable" };
      return {
        kind: "send",
        to,
        email: certificateIssuedEmail({
          name: user.name,
          programTitle: certificate.programTitleSnapshot,
          certificateId: certificate.certificateId,
          issuedAt: DATE.format(certificate.issuedAt),
          link: siteLink(`/student/certificates/${certificate.certificateId}`),
          // The public lookup by number (not the secret QR token).
          verifyUrl: siteLink(`/verify?id=${certificate.certificateId}`),
        }),
      };
    }

    case "certificate_revoked": {
      const certificate = id ? await CertificateModel.findById(id).lean() : null;
      if (!certificate || certificate.status !== "revoked") return { kind: "cancel", code: "not_applicable" };
      return {
        kind: "send",
        to,
        email: certificateRevokedEmail({
          name: user.name,
          programTitle: certificate.programTitleSnapshot,
          certificateId: certificate.certificateId,
          link: siteLink(`/student/certificates/${certificate.certificateId}`),
        }),
      };
    }

    case "certificate_replaced": {
      const old = id ? await CertificateModel.findById(id).lean() : null;
      const replacement = old ? await CertificateModel.findOne({ supersedesCertificateId: old._id, status: "issued" }).lean() : null;
      if (!old || old.status !== "superseded" || !replacement) return { kind: "cancel", code: "not_applicable" };
      return {
        kind: "send",
        to,
        email: certificateReplacedEmail({
          name: user.name,
          programTitle: replacement.programTitleSnapshot,
          oldCertificateId: old.certificateId,
          newCertificateId: replacement.certificateId,
          link: siteLink(`/student/certificates/${replacement.certificateId}`),
        }),
      };
    }

    case "password_reset":
      // Reset emails are sent directly (sendPasswordResetEmail); the token is never stored in a job.
      return { kind: "fail", code: "not_queueable" };
  }
}

// ---------- Password reset (direct, not queued) ----------

/**
 * Sends a reset link right away (called after the response, so timing does
 * not reveal whether the account exists). The raw token is only in memory:
 * it is never stored in the job or logged, so this email is not retried; the
 * person can simply request another link. A job record (without the link)
 * keeps the outcome visible to administrators.
 */
export async function sendPasswordResetEmail(input: { userId: string; resetUrl: string; expiresInMinutes: number }): Promise<void> {
  const config = getEmailConfig();
  if (config.status !== "ready") return;
  await connectToDatabase();
  const user = await UserModel.findById(input.userId).select("email").lean();
  const to = validRecipient(user?.email);
  const job = await EmailJobModel.create({
    type: "password_reset",
    userId: new Types.ObjectId(input.userId),
    idempotencyKey: `password_reset:${randomUUID()}`,
    status: "processing",
    attemptCount: 1,
    lockedUntil: new Date(Date.now() + LEASE_MS),
    expiresAt: new Date(Date.now() + input.expiresInMinutes * 60_000),
  });
  if (!to) {
    await EmailJobModel.updateOne({ _id: job._id }, { $set: { status: "failed", lockedUntil: null, lastErrorCode: "recipient_missing" } });
    return;
  }
  try {
    const { id } = await createEmailProvider(config).send({
      ...passwordResetEmail({ resetUrl: input.resetUrl, expiresInMinutes: input.expiresInMinutes }),
      to,
      idempotencyKey: `krushitech-email-${job._id.toString()}`,
    });
    await EmailJobModel.updateOne({ _id: job._id }, { $set: { status: "sent", sentAt: new Date(), providerMessageId: id, lockedUntil: null } });
  } catch (error) {
    const code = error instanceof EmailPermanentError || error instanceof EmailTransientError ? error.code : "unexpected_error";
    await EmailJobModel.updateOne({ _id: job._id }, { $set: { status: "failed", lockedUntil: null, lastErrorCode: code } });
  }
}

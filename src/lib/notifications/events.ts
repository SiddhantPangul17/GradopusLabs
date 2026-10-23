import "server-only";
import type { Types } from "mongoose";
import { brand } from "@/config/brand";
import { enqueueEmail } from "@/lib/email/outbox";
import { createNotification } from "@/lib/services/notification-service";

/*
 * Business events → email job + in-app notification. Called by the payment,
 * enrolment, review, certificate and registration services ONLY after their
 * own database change succeeded. Every call is idempotent (one key per event),
 * so webhook retries and repeated requests never duplicate notifications, and
 * nothing here can throw back into the business operation.
 *
 * Messages carry no secrets, tokens or payment credentials; emails are
 * rendered later from the current records.
 */

type Id = string | Types.ObjectId;
const str = (id: Id) => String(id);

export async function notifyWelcome(userId: Id): Promise<void> {
  await Promise.all([
    enqueueEmail({ type: "welcome", userId, idempotencyKey: `welcome:${str(userId)}`, relatedEntityType: "user", relatedEntityId: userId }),
    createNotification({
      userId,
      type: "welcome",
      title: `Welcome to ${brand.name}`,
      message: "Your account is ready. Browse the programs and enrol when you're ready.",
      link: "/student",
      idempotencyKey: `welcome:${str(userId)}`,
    }),
  ]);
}

export async function notifyPaymentConfirmed(payment: { _id: Id; studentId: Id; enrollmentId: Id | null }, programTitle: string): Promise<void> {
  const key = `payment_confirmation:${str(payment._id)}`;
  await Promise.all([
    enqueueEmail({ type: "payment_confirmation", userId: payment.studentId, idempotencyKey: key, relatedEntityType: "payment", relatedEntityId: payment._id }),
    createNotification({
      userId: payment.studentId,
      type: "payment_confirmed",
      title: "Payment confirmed",
      message: `We received and verified your payment for ${programTitle}.`,
      link: "/student/payments",
      idempotencyKey: key,
    }),
  ]);
}

export async function notifyEnrollmentActivated(enrollment: { _id: Id; studentId: Id }, programTitle: string): Promise<void> {
  const key = `enrollment_confirmation:${str(enrollment._id)}`;
  await Promise.all([
    enqueueEmail({
      type: "enrollment_confirmation",
      userId: enrollment.studentId,
      idempotencyKey: key,
      relatedEntityType: "enrollment",
      relatedEntityId: enrollment._id,
    }),
    createNotification({
      userId: enrollment.studentId,
      type: "enrollment_confirmed",
      title: "You're enrolled",
      message: `Your enrolment in ${programTitle} is active. Start with the first module.`,
      link: `/student/programs/${str(enrollment._id)}`,
      idempotencyKey: key,
    }),
  ]);
}

const DECISION_TEXT: Record<string, string> = {
  accepted: "was accepted",
  changes_requested: "needs changes",
  rejected: "was not accepted",
};

/** Final review decisions only ("under review" is shown in the app, not notified). */
export async function notifySubmissionReviewed(
  submission: { _id: Id; studentId: Id; taskId: Id; attempt: number; status: string },
  taskTitle: string,
): Promise<void> {
  const text = DECISION_TEXT[submission.status];
  if (!text) return;
  const key = `submission_reviewed:${str(submission._id)}:${submission.status}`;
  await Promise.all([
    enqueueEmail({
      type: "submission_reviewed",
      userId: submission.studentId,
      idempotencyKey: key,
      relatedEntityType: "submission",
      relatedEntityId: submission._id,
      data: { status: submission.status },
    }),
    createNotification({
      userId: submission.studentId,
      type: "submission_reviewed",
      title: "Submission reviewed",
      message: `Your submission for "${taskTitle}" ${text}.`,
      link: `/student/tasks/${str(submission.taskId)}#attempt-${submission.attempt}`,
      idempotencyKey: key,
    }),
  ]);
}

export async function notifyCertificateIssued(certificate: { _id: Id; studentId: Id; certificateId: string; programTitleSnapshot: string }): Promise<void> {
  const key = `certificate_issued:${str(certificate._id)}`;
  await Promise.all([
    enqueueEmail({ type: "certificate_issued", userId: certificate.studentId, idempotencyKey: key, relatedEntityType: "certificate", relatedEntityId: certificate._id }),
    createNotification({
      userId: certificate.studentId,
      type: "certificate_issued",
      title: "Certificate issued",
      message: `Your certificate ${certificate.certificateId} for ${certificate.programTitleSnapshot} is ready to download.`,
      link: `/student/certificates/${certificate.certificateId}`,
      idempotencyKey: key,
    }),
  ]);
}

export async function notifyCertificateRevoked(certificate: { _id: Id; studentId: Id; certificateId: string; programTitleSnapshot: string }): Promise<void> {
  const key = `certificate_revoked:${str(certificate._id)}`;
  await Promise.all([
    enqueueEmail({ type: "certificate_revoked", userId: certificate.studentId, idempotencyKey: key, relatedEntityType: "certificate", relatedEntityId: certificate._id }),
    createNotification({
      userId: certificate.studentId,
      type: "certificate_revoked",
      title: "Certificate revoked",
      message: `Your certificate ${certificate.certificateId} for ${certificate.programTitleSnapshot} has been revoked and is no longer valid.`,
      link: `/student/certificates/${certificate.certificateId}`,
      idempotencyKey: key,
    }),
  ]);
}

export async function notifyCertificateReplaced(
  old: { _id: Id; studentId: Id; certificateId: string },
  replacement: { certificateId: string; programTitleSnapshot: string },
): Promise<void> {
  const key = `certificate_replaced:${str(old._id)}`;
  await Promise.all([
    enqueueEmail({ type: "certificate_replaced", userId: old.studentId, idempotencyKey: key, relatedEntityType: "certificate", relatedEntityId: old._id }),
    createNotification({
      userId: old.studentId,
      type: "certificate_replaced",
      title: "Corrected certificate issued",
      message: `Certificate ${old.certificateId} was replaced by ${replacement.certificateId} for ${replacement.programTitleSnapshot}.`,
      link: `/student/certificates/${replacement.certificateId}`,
      idempotencyKey: key,
    }),
  ]);
}

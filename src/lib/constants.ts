/*
 * Domain enums shared by the Mongoose models, Zod validation and the UI.
 * Keep the database, validation and display layers in sync by deriving their
 * types from these arrays instead of repeating string literals.
 */

export const PROGRAM_STATUSES = ["draft", "published", "archived"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const PROGRAM_LEVELS = ["beginner", "intermediate", "advanced"] as const;

/** Whether students can enroll in a published program. */
export const PROGRAM_AVAILABILITY = ["open", "coming-soon", "closed"] as const;

export const USER_ROLES = ["student", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACCOUNT_STATUSES = ["active", "suspended", "deactivated"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ENROLLMENT_STATUSES = ["pending", "active", "completed", "cancelled"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/** Statuses that count as a current enrollment; at most one per student and program. */
export const CURRENT_ENROLLMENT_STATUSES = ["pending", "active"] as const satisfies readonly EnrollmentStatus[];

/** How an enrollment was created: "manual" (admin/operator, no payment) or "payment" (after a verified online payment). */
export const ENROLLMENT_SOURCES = ["manual", "payment"] as const;
export type EnrollmentSource = (typeof ENROLLMENT_SOURCES)[number];

// ---------- Learning content ----------

/** "file" is modelled for the future but rejected until private file storage is configured. */
export const TASK_TYPES = ["text", "project_url", "file"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/**
 * When a task counts as complete:
 * - "review": only after a reviewer accepts a submission.
 * - "submission": as soon as a valid submission is made (unless a reviewer later rejects it).
 */
export const TASK_COMPLETION_RULES = ["review", "submission"] as const;
export type TaskCompletionRule = (typeof TASK_COMPLETION_RULES)[number];

export const SUBMISSION_STATUSES = ["submitted", "under_review", "changes_requested", "accepted", "rejected"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Submission types students can use today. Add "file" when storage exists. */
export const AVAILABLE_SUBMISSION_TYPES = ["text", "project_url"] as const;
export type SubmissionType = (typeof AVAILABLE_SUBMISSION_TYPES)[number];

export const MAX_SUBMISSION_ATTEMPTS = 10;

/** File extensions a "file" task may allow once uploads are enabled. */
export const ALLOWED_UPLOAD_EXTENSIONS = [".pdf", ".zip", ".png", ".jpg", ".jpeg", ".txt", ".md", ".docx", ".pptx"] as const;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const AUDIT_ENTITY_TYPES = [
  "program",
  "module",
  "task",
  "user",
  "enrollment",
  "certificate",
  "submission",
  "payment",
  "refund",
  "email_job",
  "report",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  "program.created",
  "program.updated",
  "program.published",
  "program.archived",
  "program.unpublished",
  "curriculum.imported",
  "module.created",
  "module.updated",
  "module.reordered",
  "task.created",
  "task.updated",
  "task.reordered",
  "submission.reviewed",
  "submission.feedback_updated",
  "user.role_changed",
  "user.status_changed",
  "enrollment.created",
  "enrollment.status_changed",
  "payment.order_created",
  "payment.paid",
  "payment.authorized",
  "payment.failed",
  "payment.cancelled",
  "payment.verification_failed",
  "payment.needs_attention",
  "payment.reconciled",
  "refund.requested",
  "refund.updated",
  "certificate.issued",
  "certificate.revoked",
  "certificate.superseded",
  "certificate.issue_refused",
  "certificate.downloaded",
  "email.retried",
  "analytics.exported",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Slugs: lowercase words separated by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 100;

/** ISO 4217 currency code, e.g. INR. */
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Upper bound for a price in the smallest currency unit (1,00,00,000 paise = ₹10,00,000). */
export const MAX_PRICE_MINOR_UNITS = 100_000_000;

// ---------- Payments ----------

/**
 * Local payment states. Only the payment service changes them, and only along
 * PAYMENT_TRANSITIONS (src/lib/payments/state.ts). "paid" is set only after
 * the provider has confirmed a captured payment for the right order, amount
 * and currency, never from browser input.
 */
export const PAYMENT_STATUSES = [
  "created", // provider order created; no verified payment yet
  "pending", // checkout returned, confirmation not yet available
  "authorized", // provider authorized but has not captured the money
  "paid", // captured and verified
  "failed",
  "cancelled",
  "refund_pending",
  "refunded",
  "partially_refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Payments that may still be completed by the student (one at a time per student and program). */
export const OPEN_PAYMENT_STATUSES = ["created", "pending", "authorized"] as const satisfies readonly PaymentStatus[];

export const PAYMENT_PROVIDERS = ["razorpay"] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

/** Test payments never mix with live ones: every record says which credentials created it. */
export const PAYMENT_MODES = ["test", "live"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** Smallest amount the provider accepts for an INR order (₹1.00). */
export const MIN_ONLINE_PAYMENT_PAISE = 100;

/** Currencies the checkout supports. Only INR until another currency is approved and tested. */
export const ONLINE_PAYMENT_CURRENCIES = ["INR"] as const;

/**
 * Refund states, kept separate from the payment status. Refunds are NOT
 * implemented: these exist so the model is ready for a verified gateway workflow.
 */
export const REFUND_STATUSES = ["requested", "pending", "processed", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/**
 * Why a payment needs an administrator's follow-up. The payment status stays
 * truthful (e.g. "paid" when money was captured); this explains what could not
 * be completed automatically.
 */
export const PAYMENT_ATTENTION_REASONS = [
  "program_unavailable", // paid, but the program was no longer published, so no access was granted
  "already_enrolled", // paid, but the student already had a current enrollment (possible duplicate payment)
  "verification_mismatch", // provider data did not match the order, amount, currency or student
] as const;
export type PaymentAttentionReason = (typeof PAYMENT_ATTENTION_REASONS)[number];

// ---------- Certificates ----------

/**
 * issued: currently valid. revoked: withdrawn (e.g. misconduct); no longer valid.
 * superseded: replaced by a corrected certificate. Records are never deleted.
 */
export const CERTIFICATE_STATUSES = ["issued", "revoked", "superseded"] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

/** Bump when the PDF layout changes; each certificate records the version it was issued with. */
export const CERTIFICATE_TEMPLATE_VERSION = 1;

/** Readable certificate number: PREFIX-YEAR-SEQUENCE, e.g. GOL-2026-000001. */
export const CERTIFICATE_ID_PATTERN = /^[A-Z]{2,6}-\d{4}-\d{6,9}$/;

// ---------- Email and in-app notifications ----------

/** Transactional emails. All are tied to the student's own account activity; there is no marketing email. */
export const EMAIL_TYPES = [
  "welcome",
  "password_reset",
  "payment_confirmation",
  "enrollment_confirmation",
  "submission_reviewed",
  "certificate_issued",
  "certificate_revoked",
  "certificate_replaced",
] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

/** pending → processing → sent | failed (permanent or out of retries) | cancelled (expired or no longer applicable). */
export const EMAIL_JOB_STATUSES = ["pending", "processing", "sent", "failed", "cancelled"] as const;
export type EmailJobStatus = (typeof EMAIL_JOB_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "welcome",
  "payment_confirmed",
  "enrollment_confirmed",
  "submission_reviewed",
  "certificate_issued",
  "certificate_revoked",
  "certificate_replaced",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

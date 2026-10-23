import type { Status } from "@/components/ui/status-badge";
import type { AccountStatus, AuditAction, ProgramStatus } from "@/lib/constants";

/* Display labels for admin screens. */

export const programStatusDisplay: Record<ProgramStatus, { label: string; status: Status }> = {
  draft: { label: "Draft", status: "neutral" },
  published: { label: "Published", status: "success" },
  archived: { label: "Archived", status: "warning" },
};

export const accountStatusDisplay: Record<AccountStatus, { label: string; status: Status }> = {
  active: { label: "Active", status: "success" },
  suspended: { label: "Suspended", status: "error" },
  deactivated: { label: "Deactivated", status: "neutral" },
};

const AUDIT_LABELS: Partial<Record<AuditAction, string>> = {
  "program.created": "Program created",
  "program.updated": "Program updated",
  "program.published": "Program published",
  "program.archived": "Program archived",
  "program.unpublished": "Program moved back to draft",
  "curriculum.imported": "Content imported",
  "module.created": "Module created",
  "module.updated": "Module updated",
  "module.reordered": "Modules reordered",
  "task.created": "Task created",
  "task.updated": "Task updated",
  "task.reordered": "Tasks reordered",
  "submission.reviewed": "Submission reviewed",
  "submission.feedback_updated": "Review feedback updated",
  "user.role_changed": "User role changed",
  "user.status_changed": "Account status changed",
  "enrollment.created": "Enrolment created",
  "enrollment.status_changed": "Enrolment status changed",
  "payment.order_created": "Payment order created",
  "payment.paid": "Payment verified as paid",
  "payment.authorized": "Payment authorized (not captured)",
  "payment.failed": "Payment failed",
  "payment.cancelled": "Payment cancelled",
  "payment.verification_failed": "Payment verification failed",
  "payment.needs_attention": "Payment needs attention",
  "payment.reconciled": "Payment checked with provider",
  "refund.requested": "Refund requested",
  "refund.updated": "Refund updated",
  "certificate.issued": "Certificate issued",
  "certificate.revoked": "Certificate revoked",
  "certificate.superseded": "Certificate superseded by a correction",
  "certificate.issue_refused": "Certificate issuance refused (not eligible)",
  "certificate.downloaded": "Certificate PDF downloaded by admin",
  "email.retried": "Failed email re-queued",
  "analytics.exported": "Report exported (CSV)",
};

export function auditActionLabel(action: AuditAction): string {
  return AUDIT_LABELS[action] ?? action;
}

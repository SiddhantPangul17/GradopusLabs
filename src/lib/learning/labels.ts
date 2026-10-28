import type { Status } from "@/components/ui/status-badge";
import { brand } from "@/config/brand";
import type { CertificateStatus, EnrollmentStatus, SubmissionStatus, TaskType } from "@/lib/constants";
import type { ProgramState, TaskState } from "@/lib/learning/progress";

/* Display labels for learning states, so every page describes them the same way. */

type Display = { label: string; status: Status };

export const enrollmentStatusDisplay: Record<EnrollmentStatus, Display> = {
  pending: { label: "Awaiting confirmation", status: "pending" },
  active: { label: "Active", status: "success" },
  completed: { label: "Completed", status: "success" },
  cancelled: { label: "Cancelled", status: "neutral" },
};

export const programStateDisplay: Record<ProgramState, Display> = {
  no_content: { label: "Content coming soon", status: "neutral" },
  not_started: { label: "Not started", status: "neutral" },
  in_progress: { label: "In progress", status: "pending" },
  awaiting_review: { label: "Awaiting review", status: "pending" },
  requirements_completed: { label: "Requirements completed", status: "success" },
};

/** Issue target promised in the Certificate Issuance & Verification Policy, section 7. */
export const CERTIFICATE_ISSUE_WORKING_DAYS = 7;

/**
 * "Your certificate is under review" message: shown from the moment the student
 * has submitted every required task until a certificate exists for the
 * enrollment. Null while work remains, or once a certificate was issued (or revoked).
 */
export function certificateWaitMessage(
  state: ProgramState,
  certificate: CertificateStatus | null,
): { title: string; body: string } | null {
  if (certificate !== null) return null;
  const title = "Your certificate is under review";
  if (state === "awaiting_review") {
    return {
      title,
      body: `You have submitted every required task. Once a reviewer accepts your final work, your certificate will be issued within ${CERTIFICATE_ISSUE_WORKING_DAYS} working days. If changes are requested, you will see the feedback on the task.`,
    };
  }
  if (state === "requirements_completed") {
    return {
      title,
      body: `You have completed every requirement. Our team is checking your records, and your certificate will be issued within ${CERTIFICATE_ISSUE_WORKING_DAYS} working days. It will appear under Certificates, and you will get a notification when it is ready.`,
    };
  }
  return null;
}

export const taskStateDisplay: Record<TaskState, Display> = {
  not_started: { label: "Not started", status: "neutral" },
  awaiting_review: { label: "Awaiting review", status: "pending" },
  changes_requested: { label: "Changes requested", status: "warning" },
  rejected: { label: "Not accepted", status: "error" },
  completed: { label: "Completed", status: "success" },
};

export const submissionStatusDisplay: Record<SubmissionStatus, Display> = {
  submitted: { label: "Submitted", status: "pending" },
  under_review: { label: "Under review", status: "pending" },
  changes_requested: { label: "Changes requested", status: "warning" },
  accepted: { label: "Accepted", status: "success" },
  rejected: { label: "Not accepted", status: "error" },
};

export const taskTypeLabel: Record<TaskType, string> = {
  text: "Written answer",
  project_url: "Project link",
  file: "File upload",
};

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(brand.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: brand.timeZone,
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(brand.locale, { dateStyle: "medium", timeZone: brand.timeZone }).format(new Date(iso));
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

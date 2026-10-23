import {
  MAX_SUBMISSION_ATTEMPTS,
  type EnrollmentStatus,
  type ProgramStatus,
  type SubmissionStatus,
  type TaskCompletionRule,
} from "@/lib/constants";

/* Access, review and resubmission rules for the learning area. Pure functions. */

// ---------- Enrolment access ----------

/**
 * What a student may do in a program, given their enrolment and the program:
 * - active enrolment: full access (read and submit)
 * - completed enrolment: read-only (view content and their submissions)
 * - pending or cancelled enrolment: no access to content
 *
 * Archived programs (no longer sold) stay available to existing students.
 * Draft programs (pulled back for editing) are unavailable to everyone.
 */
export type LearningAccess = "full" | "read_only" | "none";

export function learningAccess(enrollmentStatus: EnrollmentStatus, programStatus: ProgramStatus): LearningAccess {
  if (programStatus === "draft") return "none";
  if (enrollmentStatus === "active") return "full";
  if (enrollmentStatus === "completed") return "read_only";
  return "none";
}

// ---------- Review transitions (reviewers only; students only ever create "submitted") ----------

const REVIEW_TRANSITIONS: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
  submitted: ["under_review", "accepted", "changes_requested", "rejected"],
  under_review: ["accepted", "changes_requested", "rejected"],
  changes_requested: [],
  accepted: [],
  rejected: [],
};

export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return REVIEW_TRANSITIONS[from].includes(to);
}

// ---------- Resubmission policy ----------

/**
 * Whether a student may submit a new attempt, given their latest attempt:
 * - no attempt yet: yes
 * - changes requested or rejected: yes (a new attempt; earlier ones are kept)
 * - accepted: no (the task is done)
 * - waiting for review (submitted / under review) on a "review" task: no, until reviewed
 * - "submission" tasks that are not under review: yes, to update the answer
 * - never more than MAX_SUBMISSION_ATTEMPTS attempts
 */
export type ResubmissionDecision = { allowed: true } | { allowed: false; reason: string };

export function canSubmitAttempt(
  completionRule: TaskCompletionRule,
  latest: { attempt: number; status: SubmissionStatus } | undefined,
): ResubmissionDecision {
  if (!latest) return { allowed: true };
  if (latest.attempt >= MAX_SUBMISSION_ATTEMPTS) {
    return { allowed: false, reason: `You have used all ${MAX_SUBMISSION_ATTEMPTS} attempts for this task.` };
  }
  switch (latest.status) {
    case "accepted":
      return { allowed: false, reason: "Your submission was accepted. No further attempts are needed." };
    case "under_review":
      return { allowed: false, reason: "Your submission is being reviewed. You can submit again if changes are requested." };
    case "submitted":
      return completionRule === "submission"
        ? { allowed: true }
        : { allowed: false, reason: "Your submission is waiting for review. You can submit again if changes are requested." };
    case "changes_requested":
    case "rejected":
      return { allowed: true };
  }
}

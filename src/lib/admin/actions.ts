"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  formFieldErrors,
  intField,
  istLocalToIso,
  lines,
  parseTitledLines,
  rupeesToPaise,
  slugify,
} from "@/lib/admin/form-parsing";
import { programEditSchema } from "@/lib/validation/admin";
import { getCurrentUser } from "@/lib/auth/session";
import type { FormResult } from "@/lib/form-result";
import { readFormText } from "@/lib/forms";
import {
  createModule,
  createTask,
  moveModule,
  moveTask,
  setModulePublished,
  setTaskPublished,
  updateModule,
  updateTask,
  type Direction,
} from "@/lib/services/admin-content-service";
import { createManualEnrollmentAsAdmin, setStudentAccountStatus } from "@/lib/services/admin-people-service";
import { createProgramAsAdmin, PROGRAM_FIELD_MAP, setProgramStatus, updateProgramAsAdmin } from "@/lib/services/admin-program-service";
import { decideSubmission, updateReviewFeedback } from "@/lib/services/admin-review-service";
import { issueCertificate, replaceCertificate, revokeCertificate } from "@/lib/services/certificate-service";
import { processEmailOutbox } from "@/lib/email/outbox";
import { retryEmailJob } from "@/lib/services/admin-notification-service";
import { reconcilePayment } from "@/lib/services/payment-service";
import type { Actor } from "@/lib/services/authorization";
import type { ServiceFailure } from "@/lib/services/result";

/*
 * Admin Server Actions. Each one re-verifies the session and the admin role
 * itself, reads only the named form fields (identity, role, reviewer and
 * status never come from the client), and delegates to a service that checks
 * the admin role again, validates with Zod and writes an audit entry.
 */

const UNEXPECTED: FormResult = { status: "error", message: "Something went wrong. Please try again in a moment." };

async function adminActor(): Promise<{ actor: Actor; error?: never } | { actor?: never; error: FormResult }> {
  const user = await getCurrentUser();
  if (!user) return { error: { status: "error", message: "Your session has ended. Please log in again." } };
  if (user.role !== "admin") return { error: { status: "error", message: "Only administrators can do this." } };
  return { actor: { id: user.id, role: user.role } };
}

function toError(failure: ServiceFailure): FormResult {
  return { status: "error", message: failure.message, ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}) };
}

async function run<T>(context: string, body: (actor: Actor) => Promise<T>): Promise<T | FormResult> {
  const guard = await adminActor();
  if (guard.error) return guard.error;
  try {
    return await body(guard.actor);
  } catch (error) {
    // Let redirect() through; report anything else generically.
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
    console.error(`[admin] ${context} failed unexpectedly`);
    return UNEXPECTED;
  }
}

const text = (formData: FormData, name: string, max = 60_000) => readFormText(formData, name, max);
const checked = (formData: FormData, name: string) => formData.get(name) === "on";

// ---------- Programs ----------

/** Builds program input from the form. Price is typed in rupees and stored as integer paise. */
function programInput(formData: FormData): { input: Record<string, unknown>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const price = rupeesToPaise(text(formData, "priceRupees", 30));
  if (price === null) errors.priceRupees = "Enter the price in rupees, e.g. 99 or 99.50 (no negative values).";
  const title = text(formData, "title", 300);
  return {
    errors,
    input: {
      title,
      slug: slugify(text(formData, "slug", 200) || title),
      shortDescription: text(formData, "shortDescription", 1_000),
      description: text(formData, "description", 20_000),
      category: text(formData, "category", 200),
      difficulty: text(formData, "difficulty", 30),
      duration: { weeks: intField(text(formData, "durationWeeks", 10)), weeklyEffort: text(formData, "weeklyEffort", 200) },
      deliveryFormat: text(formData, "deliveryFormat", 500),
      price: price ?? 0,
      currency: text(formData, "currency", 10) || "INR",
      learningOutcomes: lines(text(formData, "learningOutcomes")),
      prerequisites: lines(text(formData, "prerequisites")),
      audience: lines(text(formData, "audience")),
      modules: parseTitledLines(text(formData, "syllabus")).map(({ title: moduleTitle, detail }) => ({
        title: moduleTitle,
        topics: detail.split(";").map((topic) => topic.trim()).filter(Boolean),
      })),
      tasks: parseTitledLines(text(formData, "sampleTasks")).map(({ title: taskTitle, detail }) => ({ title: taskTitle, description: detail })),
      finalProject: text(formData, "finalProject", 2_000),
      inclusions: lines(text(formData, "inclusions")),
      completionCriteria: lines(text(formData, "completionCriteria")),
      availability: text(formData, "availability", 30),
      featured: checked(formData, "featured"),
      displayOrder: intField(text(formData, "displayOrder", 10) || "0"),
    },
  };
}

/**
 * When the form itself has errors (e.g. an unparseable price), NOTHING is
 * saved; the schema is still run so every problem is reported at once.
 */
function formErrorsOnly(input: Record<string, unknown>, errors: Record<string, string>): FormResult {
  const parsed = programEditSchema.safeParse(input);
  const schemaErrors = parsed.success ? {} : formFieldErrors(parsed.error, PROGRAM_FIELD_MAP);
  return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: { ...schemaErrors, ...errors } };
}

export async function createProgramAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const result = await run("program create", async (actor) => {
    const { input, errors } = programInput(formData);
    if (Object.keys(errors).length > 0) return formErrorsOnly(input, errors);
    const saved = await createProgramAsAdmin(actor, input);
    if (!saved.ok) return toError(saved);
    redirect(`/admin/programs/${saved.data.id}?created=1`);
  });
  return result as FormResult;
}

export async function updateProgramAction(programId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  return run("program update", async (actor) => {
    const { input, errors } = programInput(formData);
    if (Object.keys(errors).length > 0) return formErrorsOnly(input, errors);
    const saved = await updateProgramAsAdmin(actor, programId, input);
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: "Program saved." };
  });
}

export async function changeProgramStatusAction(programId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  return run("program status change", async (actor) => {
    const saved = await setProgramStatus(actor, programId, { target: text(formData, "target", 20), confirm: checked(formData, "confirm") });
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: `Program is now ${saved.data.status}.` };
  });
}

// ---------- Modules ----------

function moduleInput(formData: FormData) {
  const title = text(formData, "title", 300);
  const minutes = text(formData, "estimatedDurationMinutes", 10);
  return {
    title,
    slug: slugify(text(formData, "slug", 200) || title),
    description: text(formData, "description", 2_000),
    content: text(formData, "content", 60_000),
    estimatedDurationMinutes: minutes ? intField(minutes) : null,
    isPublished: checked(formData, "isPublished"),
  };
}

export async function createModuleAction(programId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  const result = await run("module create", async (actor) => {
    const saved = await createModule(actor, programId, moduleInput(formData));
    if (!saved.ok) return toError(saved);
    redirect(`/admin/programs/${programId}/modules/${saved.data.id}?created=1`);
  });
  return result as FormResult;
}

export async function updateModuleAction(programId: string, moduleId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  return run("module update", async (actor) => {
    const saved = await updateModule(actor, programId, moduleId, moduleInput(formData));
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: "Module saved." };
  });
}

export async function setModulePublishedAction(programId: string, moduleId: string, publish: boolean): Promise<FormResult> {
  return run("module publish toggle", async (actor) => {
    const saved = await setModulePublished(actor, programId, moduleId, publish);
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: publish ? "Module published." : "Module hidden from students." };
  });
}

export async function moveModuleAction(programId: string, moduleId: string, direction: Direction): Promise<FormResult> {
  return run("module move", async (actor) => {
    const saved = await moveModule(actor, programId, moduleId, direction);
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: "Order updated." };
  });
}

// ---------- Tasks ----------

function taskInput(formData: FormData) {
  const title = text(formData, "title", 300);
  const due = istLocalToIso(text(formData, "dueDate", 30));
  return {
    title,
    slug: slugify(text(formData, "slug", 200) || title),
    description: text(formData, "description", 2_000),
    instructions: text(formData, "instructions", 30_000),
    taskType: text(formData, "taskType", 30),
    required: checked(formData, "required"),
    completionRule: text(formData, "completionRule", 30),
    // Invalid date text becomes an invalid value so the schema reports it.
    dueDate: due === null ? "invalid-date" : (due ?? null),
    evaluationCriteria: lines(text(formData, "evaluationCriteria", 10_000)),
    isPublished: checked(formData, "isPublished"),
  };
}

export async function createTaskAction(programId: string, moduleId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  return run("task create", async (actor) => {
    const saved = await createTask(actor, programId, moduleId, taskInput(formData));
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: "Task added." };
  });
}

export async function updateTaskAction(
  programId: string,
  moduleId: string,
  taskId: string,
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  return run("task update", async (actor) => {
    const saved = await updateTask(actor, programId, moduleId, taskId, taskInput(formData));
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: "Task saved." };
  });
}

export async function setTaskPublishedAction(programId: string, moduleId: string, taskId: string, publish: boolean): Promise<FormResult> {
  return run("task publish toggle", async (actor) => {
    const saved = await setTaskPublished(actor, programId, moduleId, taskId, publish);
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: publish ? "Task published." : "Task hidden from students." };
  });
}

export async function moveTaskAction(programId: string, moduleId: string, taskId: string, direction: Direction): Promise<FormResult> {
  return run("task move", async (actor) => {
    const saved = await moveTask(actor, programId, moduleId, taskId, direction);
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: "Order updated." };
  });
}

// ---------- Reviews ----------

function scoreField(formData: FormData): number | null {
  const raw = text(formData, "score", 10);
  return raw ? intField(raw) : null;
}

export async function reviewSubmissionAction(submissionId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  return run("review", async (actor) => {
    const saved = await decideSubmission(actor, submissionId, {
      status: text(formData, "decision", 30),
      feedback: text(formData, "feedback", 6_000),
      score: scoreField(formData),
    });
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: "Review saved." };
  });
}

export async function updateFeedbackAction(submissionId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  return run("feedback update", async (actor) => {
    const saved = await updateReviewFeedback(actor, submissionId, { feedback: text(formData, "feedback", 6_000), score: scoreField(formData) });
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: "Feedback updated." };
  });
}

// ---------- People ----------

export async function setStudentStatusAction(studentId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  return run("student status change", async (actor) => {
    const saved = await setStudentAccountStatus(actor, studentId, {
      status: text(formData, "status", 20),
      reason: text(formData, "reason", 400),
      confirm: checked(formData, "confirm"),
    });
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: saved.data.status === "suspended" ? "Account suspended; the student has been signed out." : "Account reactivated." };
  });
}

export async function manualEnrollmentAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  return run("manual enrolment", async (actor) => {
    const saved = await createManualEnrollmentAsAdmin(actor, {
      email: text(formData, "email", 300),
      programSlug: text(formData, "programSlug", 200),
      confirmNoPayment: checked(formData, "confirmNoPayment"),
    });
    if (!saved.ok) return toError(saved);
    refresh();
    return { status: "success", message: "Enrolment created (manual, no payment recorded)." };
  });
}

// ---------- Payments ----------

/**
 * Asks the payment provider for a payment's real state and applies it with
 * the same rules as webhooks (audited as payment.reconciled). There is no
 * action that sets a payment status directly.
 */
export async function reconcilePaymentAction(paymentId: string): Promise<FormResult> {
  return run("payment reconcile", async (actor) => {
    const result = await reconcilePayment(actor, paymentId);
    if (!result.ok) return toError(result);
    refresh();
    return { status: "success", message: "Checked with the payment provider." };
  });
}

// ---------- Certificates ----------

/** Issues a certificate after the server re-checks eligibility. The issuer is the signed-in admin. */
export async function issueCertificateAction(enrollmentId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  const result = await run("certificate issue", async (actor) => {
    const issued = await issueCertificate(actor, { enrollmentId, confirm: checked(formData, "confirm") });
    if (!issued.ok) return toError(issued);
    return { certificateId: issued.data.certificateId };
  });
  if ("certificateId" in result) redirect(`/admin/certificates/${encodeURIComponent(result.certificateId)}?issued=1`);
  return result;
}

export async function revokeCertificateAction(certificateId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  const result = await run("certificate revoke", async (actor) => {
    const revoked = await revokeCertificate(actor, certificateId, { reason: text(formData, "reason", 600), confirm: checked(formData, "confirm") });
    if (!revoked.ok) return toError(revoked);
    return { revoked: true as const };
  });
  // The revoke form disappears once the certificate is revoked, so confirm on the reloaded page.
  if ("revoked" in result) redirect(`/admin/certificates/${encodeURIComponent(certificateId)}?revoked=1`);
  return result;
}

export async function replaceCertificateAction(certificateId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  const result = await run("certificate replace", async (actor) => {
    const replaced = await replaceCertificate(actor, certificateId, { reason: text(formData, "reason", 600), confirm: checked(formData, "confirm") });
    if (!replaced.ok) return toError(replaced);
    return { certificateId: replaced.data.certificateId };
  });
  if ("certificateId" in result) redirect(`/admin/certificates/${encodeURIComponent(result.certificateId)}?replaced=1`);
  return result;
}

// ---------- Email outbox ----------

/** Re-queues a failed email job (same job and idempotency key; audited). */
export async function retryEmailJobAction(jobId: string): Promise<FormResult> {
  return run("email retry", async (actor) => {
    const retried = await retryEmailJob(actor, jobId);
    if (!retried.ok) return toError(retried);
    refresh();
    return { status: "success", message: "Queued for another attempt." };
  });
}

/** Processes due jobs now (the same processor the scheduler calls). */
export async function processEmailOutboxAction(): Promise<FormResult> {
  return run("email processing", async () => {
    const result = await processEmailOutbox({ limit: 25 });
    refresh();
    if (!result.configured) return { status: "error", message: "No email provider is configured, so nothing can be sent." };
    return {
      status: "success",
      message: `Accepted by the provider: ${result.sent}. Retrying later: ${result.retrying}. Failed: ${result.failed}. Cancelled: ${result.cancelled}.`,
    };
  });
}

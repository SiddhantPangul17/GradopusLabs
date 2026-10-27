import "server-only";
import { Types } from "mongoose";
import type { SubmissionStatus, SubmissionType, TaskCompletionRule, TaskType } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { isDuplicateKeyError } from "@/lib/errors";
import { latestAttempt, taskStateFor, type TaskState } from "@/lib/learning/progress";
import { canSubmitAttempt, canTransition, learningAccess, type LearningAccess, type ResubmissionDecision } from "@/lib/learning/rules";
import { recordAuditEvent } from "@/lib/services/audit-log";
import { assertAdmin, assertStudent, type Actor } from "@/lib/services/authorization";
import { notifySubmissionReviewed } from "@/lib/notifications/events";
import { refreshProgressSnapshot } from "@/lib/services/learning-service";
import { fail, type ServiceResult } from "@/lib/services/result";
import { fieldErrorsOf } from "@/lib/validation/user";
import { isValidObjectIdString } from "@/lib/validation/common";
import { reviewInputSchema, submissionInputSchema } from "@/lib/validation/submission";
import { EnrollmentModel } from "@/models/enrollment";
import { LearningModuleModel } from "@/models/learning-module";
import { LearningTaskModel, type LearningTaskRecord } from "@/models/learning-task";
import { ProgramModel } from "@/models/program";
import { SubmissionModel, type SubmissionRecord } from "@/models/submission";

/*
 * Task pages, student submissions and (admin-only) reviews.
 *
 * Students can only CREATE attempts, always with status "submitted", for
 * published tasks in programs they are actively enrolled in. They can never
 * set status, score, feedback or reviewer. Reviews go through reviewSubmission(),
 * which is admin-only and enforces the allowed status transitions.
 */

type Id = Types.ObjectId;
type TaskDoc = LearningTaskRecord & { _id: Id };
type SubmissionDoc = SubmissionRecord & { _id: Id };

const NOT_FOUND = "This task does not exist or you do not have access to it.";

export type SubmissionView = {
  id: string;
  attempt: number;
  submissionType: SubmissionType;
  textContent: string | null;
  projectUrl: string | null;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  feedback: string | null;
  score: number | null;
};

function toSubmissionView(doc: SubmissionDoc): SubmissionView {
  return {
    id: doc._id.toString(),
    attempt: doc.attempt,
    submissionType: doc.submissionType,
    textContent: doc.textContent,
    projectUrl: doc.projectUrl,
    status: doc.status,
    submittedAt: doc.submittedAt.toISOString(),
    reviewedAt: doc.reviewedAt?.toISOString() ?? null,
    feedback: doc.feedback,
    score: doc.score,
  };
}

/** A published task whose module is also published, or null. */
async function findPublishedTask(taskId: string): Promise<{ task: TaskDoc; moduleTitle: string } | null> {
  if (!isValidObjectIdString(taskId)) return null;
  const task = await LearningTaskModel.findOne({ _id: new Types.ObjectId(taskId), isPublished: true }).lean<TaskDoc>();
  if (!task) return null;
  const moduleDoc = await LearningModuleModel.findOne({ _id: task.moduleId, programId: task.programId, isPublished: true })
    .select("title")
    .lean();
  return moduleDoc ? { task, moduleTitle: moduleDoc.title } : null;
}

/**
 * The student's enrollment that grants access to the task's program: an active
 * one if it exists, otherwise a completed one (read-only).
 */
async function findAccessForTask(studentId: Id, programId: Id) {
  const program = await ProgramModel.findById(programId).select("title status").lean();
  if (!program) return null;
  const enrollments = await EnrollmentModel.find({ studentId, programId, status: { $in: ["active", "completed"] } })
    .select("status")
    .lean();
  const enrollment = enrollments.find((item) => item.status === "active") ?? enrollments[0];
  if (!enrollment) return null;
  const access = learningAccess(enrollment.status, program.status);
  return access === "none" ? null : { enrollment, program, access };
}

export type TaskPage = {
  task: {
    id: string;
    title: string;
    description: string;
    instructions: string;
    taskType: TaskType;
    required: boolean;
    completionRule: TaskCompletionRule;
    dueDate: string | null;
    allowedFileTypes: string[];
    maxFileSizeBytes: number | null;
    evaluationCriteria: string[];
  };
  module: { id: string; title: string };
  program: { title: string };
  enrollment: { id: string; access: LearningAccess };
  state: TaskState;
  attempts: SubmissionView[];
  /** Whether a new attempt can be submitted now, and why not. */
  submission: ResubmissionDecision;
};

export async function getTaskPage(actor: Actor, taskId: string): Promise<ServiceResult<TaskPage>> {
  assertStudent(actor);
  await connectToDatabase();
  const studentId = new Types.ObjectId(actor.id);

  const found = await findPublishedTask(taskId);
  if (!found) return fail("not_found", NOT_FOUND);
  const { task, moduleTitle } = found;
  const access = await findAccessForTask(studentId, task.programId);
  if (!access) return fail("not_found", NOT_FOUND);

  const attempts = await SubmissionModel.find({ studentId, enrollmentId: access.enrollment._id, taskId: task._id })
    .sort({ attempt: -1 })
    .lean<SubmissionDoc[]>();
  const latest = latestAttempt(attempts);

  let submission: ResubmissionDecision;
  if (access.access !== "full") submission = { allowed: false, reason: "This program is completed, so new submissions are closed." };
  else if (task.taskType === "file") submission = { allowed: false, reason: "File submissions are not available yet." };
  else submission = canSubmitAttempt(task.completionRule, latest);

  return {
    ok: true,
    data: {
      task: {
        id: task._id.toString(),
        title: task.title,
        description: task.description,
        instructions: task.instructions,
        taskType: task.taskType,
        required: task.required,
        completionRule: task.completionRule,
        dueDate: task.dueDate?.toISOString() ?? null,
        allowedFileTypes: task.allowedFileTypes,
        maxFileSizeBytes: task.maxFileSizeBytes,
        evaluationCriteria: task.evaluationCriteria,
      },
      module: { id: task.moduleId.toString(), title: moduleTitle },
      program: { title: access.program.title },
      enrollment: { id: access.enrollment._id.toString(), access: access.access },
      state: taskStateFor(task, attempts),
      attempts: attempts.map(toSubmissionView),
      submission,
    },
  };
}

/** Creates a new attempt for the signed-in student. Never overwrites earlier attempts. */
export async function submitTaskAttempt(
  actor: Actor,
  taskId: string,
  input: unknown,
): Promise<ServiceResult<{ submissionId: string; attempt: number }>> {
  assertStudent(actor);
  const parsed = submissionInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please check your submission.", fieldErrorsOf(parsed.error));

  await connectToDatabase();
  const studentId = new Types.ObjectId(actor.id);
  const found = await findPublishedTask(taskId);
  if (!found) return fail("not_found", NOT_FOUND);
  const { task } = found;
  const access = await findAccessForTask(studentId, task.programId);
  if (!access) return fail("not_found", NOT_FOUND);
  if (access.access !== "full") return fail("forbidden", "This program is completed, so new submissions are closed.");

  if (task.taskType === "file") return fail("invalid", "File submissions are not available yet.");
  if (parsed.data.submissionType !== task.taskType) {
    return fail("invalid", "This task needs a different type of submission.");
  }

  const latest = await SubmissionModel.findOne({ enrollmentId: access.enrollment._id, taskId: task._id })
    .sort({ attempt: -1 })
    .select("attempt status")
    .lean();
  const decision = canSubmitAttempt(task.completionRule, latest ?? undefined);
  if (!decision.allowed) return fail("conflict", decision.reason);

  let created;
  try {
    created = await SubmissionModel.create({
      studentId,
      enrollmentId: access.enrollment._id,
      programId: task.programId,
      moduleId: task.moduleId,
      taskId: task._id,
      attempt: (latest?.attempt ?? 0) + 1,
      submissionType: parsed.data.submissionType,
      textContent: parsed.data.submissionType === "text" ? parsed.data.textContent : null,
      projectUrl: parsed.data.submissionType === "project_url" ? parsed.data.projectUrl : null,
      status: "submitted",
      submittedAt: new Date(),
    });
  } catch (error) {
    // The unique (enrollment, task, attempt) index rejected a simultaneous duplicate.
    if (isDuplicateKeyError(error)) return fail("conflict", "Another submission was made at the same time. Refresh the page and try again.");
    throw error;
  }

  await refreshProgressSnapshot(access.enrollment._id.toString());
  return { ok: true, data: { submissionId: created._id.toString(), attempt: created.attempt } };
}

export type SubmissionListItem = {
  id: string;
  taskId: string;
  taskTitle: string;
  programTitle: string;
  attempt: number;
  status: SubmissionStatus;
  submittedAt: string;
  hasFeedback: boolean;
};

export type SubmissionPage = { items: SubmissionListItem[]; page: number; totalPages: number; total: number };

export const SUBMISSIONS_PAGE_SIZE = 20;

/** The signed-in student's own submissions, newest first. */
export async function listOwnSubmissions(actor: Actor, page: number): Promise<SubmissionPage> {
  assertStudent(actor);
  await connectToDatabase();
  const studentId = new Types.ObjectId(actor.id);
  const total = await SubmissionModel.countDocuments({ studentId });
  const totalPages = Math.max(1, Math.ceil(total / SUBMISSIONS_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);

  const docs = await SubmissionModel.find({ studentId })
    .sort({ submittedAt: -1, _id: -1 })
    .skip((current - 1) * SUBMISSIONS_PAGE_SIZE)
    .limit(SUBMISSIONS_PAGE_SIZE)
    .select("taskId programId attempt status submittedAt feedback")
    .lean();
  const [tasks, programs] = await Promise.all([
    LearningTaskModel.find({ _id: { $in: docs.map((doc) => doc.taskId) } }).select("title").lean(),
    ProgramModel.find({ _id: { $in: docs.map((doc) => doc.programId) } }).select("title").lean(),
  ]);
  const taskTitle = new Map(tasks.map((task) => [task._id.toString(), task.title]));
  const programTitle = new Map(programs.map((program) => [program._id.toString(), program.title]));

  return {
    total,
    totalPages,
    page: current,
    items: docs.map((doc) => ({
      id: doc._id.toString(),
      taskId: doc.taskId.toString(),
      taskTitle: taskTitle.get(doc.taskId.toString()) ?? "Task",
      programTitle: programTitle.get(doc.programId.toString()) ?? "Program",
      attempt: doc.attempt,
      status: doc.status,
      submittedAt: doc.submittedAt.toISOString(),
      hasFeedback: Boolean(doc.feedback),
    })),
  };
}

/**
 * Records a reviewer's decision. ADMIN ONLY (not exposed through any route yet;
 * the admin review screen comes later). Enforces allowed transitions with an
 * atomic compare-and-set, so two reviewers cannot overwrite each other.
 */
export async function reviewSubmission(actor: Actor, submissionId: string, input: unknown): Promise<ServiceResult<SubmissionView>> {
  assertAdmin(actor);
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please check the review.", fieldErrorsOf(parsed.error));
  if (!isValidObjectIdString(submissionId)) return fail("not_found", "Submission not found.");

  await connectToDatabase();
  const current = await SubmissionModel.findById(submissionId).select("status enrollmentId").lean();
  if (!current) return fail("not_found", "Submission not found.");
  if (!canTransition(current.status, parsed.data.status)) {
    return fail("conflict", `A ${current.status.replace("_", " ")} submission cannot be marked ${parsed.data.status.replace("_", " ")}.`);
  }

  const updated = await SubmissionModel.findOneAndUpdate(
    { _id: current._id, status: current.status },
    {
      $set: {
        status: parsed.data.status,
        feedback: parsed.data.feedback ?? null,
        score: parsed.data.score ?? null,
        reviewerId: new Types.ObjectId(actor.id),
        reviewedAt: parsed.data.status === "under_review" ? null : new Date(),
      },
    },
    { returnDocument: "after", lean: true },
  );
  if (!updated) return fail("conflict", "This submission was changed by someone else. Reload and try again.");

  await recordAuditEvent({
    actorId: actor.id,
    action: "submission.reviewed",
    entityType: "submission",
    entityId: current._id,
    metadata: { from: current.status, to: parsed.data.status, score: parsed.data.score ?? null },
  });
  await refreshProgressSnapshot(current.enrollmentId.toString());
  // Notify only after the decision is saved (final decisions only; idempotent per submission and decision).
  const saved = updated as SubmissionDoc;
  const task = await LearningTaskModel.findById(saved.taskId).select("title").lean();
  await notifySubmissionReviewed(
    { _id: saved._id, studentId: saved.studentId, taskId: saved.taskId, attempt: saved.attempt, status: saved.status },
    task?.title ?? "your task",
  );
  return { ok: true, data: toSubmissionView(updated as SubmissionDoc) };
}

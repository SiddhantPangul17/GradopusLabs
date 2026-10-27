import "server-only";
import { Types } from "mongoose";
import { formFieldErrors } from "@/lib/admin/form-parsing";
import type { SubmissionStatus, TaskCompletionRule, TaskType } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { canTransition } from "@/lib/learning/rules";
import { recordAuditEvent } from "@/lib/services/audit-log";
import { assertAdmin, type Actor } from "@/lib/services/authorization";
import { refreshProgressSnapshot } from "@/lib/services/learning-service";
import { fail, type ServiceResult } from "@/lib/services/result";
import { reviewSubmission, type SubmissionView } from "@/lib/services/submission-service";
import { adminReviewSchema, feedbackUpdateSchema } from "@/lib/validation/admin";
import { isValidObjectIdString } from "@/lib/validation/common";
import { EnrollmentModel } from "@/models/enrollment";
import { LearningModuleModel } from "@/models/learning-module";
import { LearningTaskModel } from "@/models/learning-task";
import { ProgramModel } from "@/models/program";
import { SubmissionModel, type SubmissionRecord } from "@/models/submission";
import { UserModel } from "@/models/user";

/*
 * Submission review for administrators. The reviewer is always the signed-in
 * admin (never taken from input); decisions use the transition rules and
 * compare-and-set in reviewSubmission(); every action is audited. Accepting a
 * submission only affects progress/eligibility; it never issues a certificate.
 */

type Id = Types.ObjectId;
type SubmissionDoc = SubmissionRecord & { _id: Id };

export const REVIEW_FILTERS = {
  pending: ["submitted", "under_review"],
  changes_requested: ["changes_requested"],
  accepted: ["accepted"],
  rejected: ["rejected"],
  all: ["submitted", "under_review", "changes_requested", "accepted", "rejected"],
} as const satisfies Record<string, readonly SubmissionStatus[]>;
export type ReviewFilter = keyof typeof REVIEW_FILTERS;

export const REVIEW_PAGE_SIZE = 25;

export type ReviewQueueItem = {
  id: string;
  studentName: string;
  programTitle: string;
  moduleTitle: string;
  taskTitle: string;
  attempt: number;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
};

export type ReviewQueuePage = { items: ReviewQueueItem[]; page: number; totalPages: number; total: number };

async function titlesFor(docs: Pick<SubmissionRecord, "studentId" | "programId" | "moduleId" | "taskId">[]) {
  const unique = (values: Id[]) => [...new Map(values.map((value) => [value.toString(), value])).values()];
  const [students, programs, modules, tasks] = await Promise.all([
    UserModel.find({ _id: { $in: unique(docs.map((doc) => doc.studentId)) } }).select("name").lean(),
    ProgramModel.find({ _id: { $in: unique(docs.map((doc) => doc.programId)) } }).select("title").lean(),
    LearningModuleModel.find({ _id: { $in: unique(docs.map((doc) => doc.moduleId)) } }).select("title").lean(),
    LearningTaskModel.find({ _id: { $in: unique(docs.map((doc) => doc.taskId)) } }).select("title").lean(),
  ]);
  const map = <T extends { _id: Id }>(items: T[], pick: (item: T) => string) => new Map(items.map((item) => [item._id.toString(), pick(item)]));
  return {
    student: map(students, (item) => item.name),
    program: map(programs, (item) => item.title),
    module: map(modules, (item) => item.title),
    task: map(tasks, (item) => item.title),
  };
}

/** A bounded page of submissions. Pending work is oldest-first (first in, first reviewed). */
export async function listReviewQueue(
  actor: Actor,
  options: { filter?: ReviewFilter; programId?: string; page?: number } = {},
): Promise<ReviewQueuePage> {
  assertAdmin(actor);
  await connectToDatabase();
  const filter = options.filter && options.filter in REVIEW_FILTERS ? options.filter : "pending";
  const query: Record<string, unknown> = { status: { $in: [...REVIEW_FILTERS[filter]] } };
  if (options.programId && isValidObjectIdString(options.programId)) query.programId = new Types.ObjectId(options.programId);

  const total = await SubmissionModel.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1) || 1), totalPages);
  const docs = await SubmissionModel.find(query)
    .sort(filter === "pending" ? { submittedAt: 1, _id: 1 } : { submittedAt: -1, _id: -1 })
    .skip((page - 1) * REVIEW_PAGE_SIZE)
    .limit(REVIEW_PAGE_SIZE)
    .select("studentId programId moduleId taskId attempt status submittedAt reviewedAt")
    .lean<SubmissionDoc[]>();
  const titles = await titlesFor(docs);

  return {
    total,
    totalPages,
    page,
    items: docs.map((doc) => ({
      id: doc._id.toString(),
      studentName: titles.student.get(doc.studentId.toString()) ?? "Unknown student",
      programTitle: titles.program.get(doc.programId.toString()) ?? "Unknown program",
      moduleTitle: titles.module.get(doc.moduleId.toString()) ?? "Unknown module",
      taskTitle: titles.task.get(doc.taskId.toString()) ?? "Unknown task",
      attempt: doc.attempt,
      status: doc.status,
      submittedAt: doc.submittedAt.toISOString(),
      reviewedAt: doc.reviewedAt?.toISOString() ?? null,
    })),
  };
}

export type ReviewDetail = {
  submission: SubmissionView;
  student: { name: string; email: string };
  program: { id: string; title: string };
  module: { title: string };
  task: {
    title: string;
    description: string;
    instructions: string;
    taskType: TaskType;
    required: boolean;
    completionRule: TaskCompletionRule;
    evaluationCriteria: string[];
  };
  /** All attempts by this student for this task, newest first (including this one). */
  history: SubmissionView[];
  isLatest: boolean;
  /** Decisions allowed now (empty when the review is final). */
  allowedDecisions: SubmissionStatus[];
};

function toView(doc: SubmissionDoc): SubmissionView {
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

/**
 * Loads a submission with everything needed to review it, and checks the
 * records agree (task in program, enrollment belongs to the same student and
 * program). Inconsistent records are reported, never reviewed.
 */
async function loadForReview(submissionId: string) {
  if (!isValidObjectIdString(submissionId)) return null;
  const doc = await SubmissionModel.findById(submissionId).lean<SubmissionDoc>();
  if (!doc) return null;
  const [task, module, program, student, enrollment] = await Promise.all([
    LearningTaskModel.findOne({ _id: doc.taskId, programId: doc.programId, moduleId: doc.moduleId }).lean(),
    LearningModuleModel.findOne({ _id: doc.moduleId, programId: doc.programId }).select("title").lean(),
    ProgramModel.findById(doc.programId).select("title").lean(),
    UserModel.findById(doc.studentId).select("name email").lean(),
    EnrollmentModel.findOne({ _id: doc.enrollmentId, studentId: doc.studentId, programId: doc.programId }).select("_id").lean(),
  ]);
  const consistent = Boolean(task && module && program && student && enrollment);
  return { doc, task, module, program, student, consistent };
}

export async function getSubmissionForReview(actor: Actor, submissionId: string): Promise<ServiceResult<ReviewDetail>> {
  assertAdmin(actor);
  await connectToDatabase();
  const loaded = await loadForReview(submissionId);
  if (!loaded) return fail("not_found", "Submission not found.");
  const { doc, task, module, program, student, consistent } = loaded;
  if (!consistent || !task || !module || !program || !student) {
    return fail("conflict", "This submission's records do not match (task, program or enrollment). It cannot be reviewed.");
  }

  const history = await SubmissionModel.find({ enrollmentId: doc.enrollmentId, taskId: doc.taskId }).sort({ attempt: -1 }).lean<SubmissionDoc[]>();
  const isLatest = history[0]?._id.equals(doc._id) ?? false;
  const allowedDecisions = isLatest
    ? (["under_review", "accepted", "changes_requested", "rejected"] as const).filter((status) => canTransition(doc.status, status))
    : [];

  return {
    ok: true,
    data: {
      submission: toView(doc),
      student: { name: student.name, email: student.email },
      program: { id: program._id.toString(), title: program.title },
      module: { title: module.title },
      task: {
        title: task.title,
        description: task.description,
        instructions: task.instructions,
        taskType: task.taskType,
        required: task.required,
        completionRule: task.completionRule,
        evaluationCriteria: task.evaluationCriteria,
      },
      history: history.map(toView),
      isLatest,
      allowedDecisions: [...allowedDecisions],
    },
  };
}

/** Records a decision on the latest attempt. Reviewer = the signed-in admin. */
export async function decideSubmission(actor: Actor, submissionId: string, input: Record<string, unknown>): Promise<ServiceResult<SubmissionView>> {
  assertAdmin(actor);
  const parsed = adminReviewSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please correct the highlighted fields.", formFieldErrors(parsed.error));

  await connectToDatabase();
  const loaded = await loadForReview(submissionId);
  if (!loaded) return fail("not_found", "Submission not found.");
  if (!loaded.consistent) return fail("conflict", "This submission's records do not match. It cannot be reviewed.");
  const latest = await SubmissionModel.findOne({ enrollmentId: loaded.doc.enrollmentId, taskId: loaded.doc.taskId }).sort({ attempt: -1 }).select("_id").lean();
  if (!latest?._id.equals(loaded.doc._id)) return fail("conflict", "Only the student's latest attempt can be reviewed.");

  return reviewSubmission(actor, submissionId, {
    status: parsed.data.status,
    ...(parsed.data.feedback ? { feedback: parsed.data.feedback } : {}),
    ...(parsed.data.score !== null ? { score: parsed.data.score } : {}),
  });
}

/** Adds or corrects feedback/score on an already-decided submission. Status does not change. */
export async function updateReviewFeedback(actor: Actor, submissionId: string, input: Record<string, unknown>): Promise<ServiceResult<null>> {
  assertAdmin(actor);
  const parsed = feedbackUpdateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please correct the highlighted fields.", formFieldErrors(parsed.error));
  if (!isValidObjectIdString(submissionId)) return fail("not_found", "Submission not found.");

  await connectToDatabase();
  const current = await SubmissionModel.findById(submissionId).select("status enrollmentId feedback score").lean();
  if (!current) return fail("not_found", "Submission not found.");
  const decided: SubmissionStatus[] = ["accepted", "changes_requested", "rejected"];
  if (!decided.includes(current.status)) return fail("conflict", "Record a decision first; feedback can be updated after that.");
  if (current.status !== "accepted" && parsed.data.feedback.length < 10) {
    return fail("invalid", "Please correct the highlighted fields.", { feedback: "The student needs an explanation (at least 10 characters)." });
  }

  const updated = await SubmissionModel.updateOne(
    { _id: current._id, status: current.status },
    { $set: { feedback: parsed.data.feedback || null, score: parsed.data.score, reviewerId: new Types.ObjectId(actor.id) } },
  );
  if (updated.modifiedCount !== 1 && updated.matchedCount !== 1) return fail("conflict", "The submission changed while you were working. Reload and try again.");

  await recordAuditEvent({
    actorId: actor.id,
    action: "submission.feedback_updated",
    entityType: "submission",
    entityId: current._id,
    metadata: { status: current.status, scoreFrom: current.score ?? null, scoreTo: parsed.data.score, feedbackChanged: (current.feedback ?? "") !== parsed.data.feedback },
  });
  await refreshProgressSnapshot(current.enrollmentId.toString());
  return { ok: true, data: null };
}

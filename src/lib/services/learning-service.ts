import "server-only";
import { Types } from "mongoose";
import type { EnrollmentSource, EnrollmentStatus, ProgramStatus, TaskCompletionRule, TaskType } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { isDuplicateKeyError } from "@/lib/errors";
import {
  evaluateProgress,
  latestAttempt,
  type ModuleProgress,
  type ProgramProgress,
  type ProgressSubmission,
  type TaskState,
} from "@/lib/learning/progress";
import { learningAccess, type LearningAccess } from "@/lib/learning/rules";
import { assertStudent, type Actor } from "@/lib/services/authorization";
import { fail, type ServiceResult } from "@/lib/services/result";
import { isValidObjectIdString } from "@/lib/validation/common";
import { EnrollmentModel, type EnrollmentRecord } from "@/models/enrollment";
import { LearningModuleModel, type LearningModuleRecord } from "@/models/learning-module";
import { LearningProgressModel } from "@/models/learning-progress";
import { LearningTaskModel, type LearningTaskRecord } from "@/models/learning-task";
import { ProgramModel } from "@/models/program";
import { SubmissionModel, type SubmissionRecord } from "@/models/submission";

/*
 * Student learning data. Every function:
 * - requires a verified student actor (assertStudent), and
 * - puts ownership into the database query itself ({ studentId: actor.id }),
 *   so another student's records behave exactly like records that do not exist.
 * Only PUBLISHED modules and tasks are ever read. Results are plain, safe objects.
 */

type Id = Types.ObjectId;
type ModuleDoc = LearningModuleRecord & { _id: Id };
type TaskDoc = LearningTaskRecord & { _id: Id };
type EnrollmentDoc = EnrollmentRecord & { _id: Id };
type ProgramSummaryDoc = { _id: Id; title: string; slug: string; category: string; status: ProgramStatus };

const NOT_FOUND = "This page does not exist or you do not have access to it.";

// ---------- View types ----------

export type ProgramSummary = { title: string; slug: string; category: string; status: ProgramStatus };

export type EnrollmentOverview = {
  id: string;
  status: EnrollmentStatus;
  source: EnrollmentSource;
  enrolledAt: string | null;
  completedAt: string | null;
  program: ProgramSummary;
  access: LearningAccess;
  /** Null when the student has no access to the content. */
  progress: ProgramProgress | null;
  nextModule: { id: string; title: string } | null;
};

export type TaskSummary = {
  id: string;
  title: string;
  description: string;
  taskType: TaskType;
  required: boolean;
  completionRule: TaskCompletionRule;
  dueDate: string | null;
  state: TaskState;
};

export type ModuleSummary = {
  id: string;
  title: string;
  description: string;
  order: number;
  estimatedDurationMinutes: number | null;
  progress: ModuleProgress;
  tasks: TaskSummary[];
};

// ---------- Internal loaders ----------

function toId(value: string): Id {
  return new Types.ObjectId(value);
}

type Curriculum = { modules: ModuleDoc[]; tasks: TaskDoc[] };

/** Published modules (without their long content) and published tasks, per program. */
async function loadCurricula(programIds: Id[]): Promise<Map<string, Curriculum>> {
  const result = new Map<string, Curriculum>();
  if (programIds.length === 0) return result;
  const modules = await LearningModuleModel.find({ programId: { $in: programIds }, isPublished: true })
    .select("-content")
    .sort({ order: 1, _id: 1 })
    .lean<ModuleDoc[]>();
  const tasks = await LearningTaskModel.find({
    programId: { $in: programIds },
    moduleId: { $in: modules.map((module) => module._id) },
    isPublished: true,
  })
    .select("-instructions")
    .sort({ order: 1, _id: 1 })
    .lean<TaskDoc[]>();
  for (const id of programIds) result.set(id.toString(), { modules: [], tasks: [] });
  for (const moduleDoc of modules) result.get(moduleDoc.programId.toString())?.modules.push(moduleDoc);
  for (const task of tasks) result.get(task.programId.toString())?.tasks.push(task);
  return result;
}

async function loadAttempts(studentId: Id, enrollmentIds: Id[]) {
  if (enrollmentIds.length === 0) return [];
  return SubmissionModel.find({ studentId, enrollmentId: { $in: enrollmentIds } })
    .select("enrollmentId taskId attempt status")
    .lean<Pick<SubmissionRecord, "enrollmentId" | "taskId" | "attempt" | "status">[]>();
}

async function loadReadModules(studentId: Id, enrollmentIds: Id[]): Promise<Map<string, string[]>> {
  const docs = enrollmentIds.length
    ? await LearningProgressModel.find({ studentId, enrollmentId: { $in: enrollmentIds } }).select("enrollmentId readModules").lean()
    : [];
  return new Map(docs.map((doc) => [doc.enrollmentId.toString(), doc.readModules.map((item) => item.moduleId.toString())]));
}

function computeProgress(curriculum: Curriculum, attempts: ProgressSubmission[], readModuleIds: string[]): ProgramProgress {
  return evaluateProgress({
    modules: curriculum.modules.map((module) => ({ id: module._id.toString(), order: module.order })),
    tasks: curriculum.tasks.map((task) => ({
      id: task._id.toString(),
      moduleId: task.moduleId.toString(),
      required: task.required,
      completionRule: task.completionRule,
    })),
    submissions: attempts,
    readModuleIds,
  });
}

function toProgramSummary(doc: ProgramSummaryDoc): ProgramSummary {
  return { title: doc.title, slug: doc.slug, category: doc.category, status: doc.status };
}

function toTaskSummary(task: TaskDoc, state: TaskState): TaskSummary {
  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description,
    taskType: task.taskType,
    required: task.required,
    completionRule: task.completionRule,
    dueDate: task.dueDate?.toISOString() ?? null,
    state,
  };
}

/** Enrollments with programs, curricula and calculated progress, in one batch of queries. */
async function buildOverviews(studentId: Id, enrollments: EnrollmentDoc[]) {
  const programs = await ProgramModel.find({ _id: { $in: enrollments.map((item) => item.programId) } })
    .select("title slug category status")
    .lean<ProgramSummaryDoc[]>();
  const programById = new Map(programs.map((program) => [program._id.toString(), program]));

  const accessible = enrollments.filter((item) => {
    const program = programById.get(item.programId.toString());
    return program && learningAccess(item.status, program.status) !== "none";
  });
  const [curricula, attempts, readModules] = await Promise.all([
    loadCurricula(accessible.map((item) => item.programId)),
    loadAttempts(studentId, accessible.map((item) => item._id)),
    loadReadModules(studentId, accessible.map((item) => item._id)),
  ]);

  const overviews: (EnrollmentOverview & { curriculum: Curriculum | null })[] = [];
  for (const enrollment of enrollments) {
    const program = programById.get(enrollment.programId.toString());
    if (!program) continue; // program deleted: nothing to show
    const access = learningAccess(enrollment.status, program.status);
    const curriculum = access === "none" ? null : (curricula.get(program._id.toString()) ?? { modules: [], tasks: [] });
    const progress = curriculum
      ? computeProgress(
          curriculum,
          attempts
            .filter((attempt) => attempt.enrollmentId.equals(enrollment._id))
            .map((attempt) => ({ taskId: attempt.taskId.toString(), attempt: attempt.attempt, status: attempt.status })),
          readModules.get(enrollment._id.toString()) ?? [],
        )
      : null;
    const nextModuleDoc = progress?.nextModuleId
      ? curriculum?.modules.find((module) => module._id.toString() === progress.nextModuleId)
      : undefined;

    overviews.push({
      id: enrollment._id.toString(),
      status: enrollment.status,
      source: enrollment.source ?? "manual",
      enrolledAt: enrollment.enrolledAt?.toISOString() ?? null,
      completedAt: enrollment.completedAt?.toISOString() ?? null,
      program: toProgramSummary(program),
      access,
      progress,
      nextModule: nextModuleDoc ? { id: nextModuleDoc._id.toString(), title: nextModuleDoc.title } : null,
      curriculum,
    });
  }
  return overviews;
}

function withoutCurriculum<T extends { curriculum: unknown }>(overview: T): Omit<T, "curriculum"> {
  const copy: Partial<T> = { ...overview };
  delete copy.curriculum;
  return copy as Omit<T, "curriculum">;
}

/** The student's own enrollment, or null (also when it belongs to someone else). */
async function findOwnEnrollment(studentId: Id, enrollmentId: string): Promise<EnrollmentDoc | null> {
  if (!isValidObjectIdString(enrollmentId)) return null;
  return EnrollmentModel.findOne({ _id: toId(enrollmentId), studentId }).lean<EnrollmentDoc>();
}

// ---------- Public API ----------

export async function listStudentEnrollments(actor: Actor): Promise<EnrollmentOverview[]> {
  assertStudent(actor);
  await connectToDatabase();
  const studentId = toId(actor.id);
  const enrollments = await EnrollmentModel.find({ studentId }).sort({ createdAt: -1 }).lean<EnrollmentDoc[]>();
  const overviews = await buildOverviews(studentId, enrollments);
  return overviews.map(withoutCurriculum);
}

export type ActivityItem = {
  kind: "submitted" | "reviewed";
  at: string;
  taskId: string;
  taskTitle: string;
  programTitle: string;
  attempt: number;
  status: SubmissionRecord["status"];
};

export type StudentDashboard = {
  enrollments: EnrollmentOverview[];
  stats: {
    activeEnrollments: number;
    completedPrograms: number;
    /** Required tasks in active programs that need the student's action. */
    pendingTasks: number;
    awaitingReview: number;
    reviewedSubmissions: number;
  };
  recentActivity: ActivityItem[];
};

export async function getStudentDashboard(actor: Actor): Promise<StudentDashboard> {
  assertStudent(actor);
  await connectToDatabase();
  const studentId = toId(actor.id);
  const enrollments = await EnrollmentModel.find({ studentId }).sort({ createdAt: -1 }).lean<EnrollmentDoc[]>();
  const overviews = await buildOverviews(studentId, enrollments);

  let pendingTasks = 0;
  let awaitingReview = 0;
  for (const overview of overviews) {
    if (overview.access !== "full" || !overview.progress || !overview.curriculum) continue;
    for (const task of overview.curriculum.tasks) {
      if (!task.required) continue;
      const state = overview.progress.taskStates[task._id.toString()];
      if (state === "not_started" || state === "changes_requested" || state === "rejected") pendingTasks += 1;
      if (state === "awaiting_review") awaitingReview += 1;
    }
  }

  const [reviewedSubmissions, recent] = await Promise.all([
    SubmissionModel.countDocuments({ studentId, status: { $in: ["accepted", "changes_requested", "rejected"] } }),
    SubmissionModel.find({ studentId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select("taskId programId attempt status submittedAt reviewedAt")
      .lean<Pick<SubmissionRecord, "taskId" | "programId" | "attempt" | "status" | "submittedAt" | "reviewedAt">[]>(),
  ]);

  const [tasks, programs] = await Promise.all([
    LearningTaskModel.find({ _id: { $in: recent.map((item) => item.taskId) } }).select("title").lean(),
    ProgramModel.find({ _id: { $in: recent.map((item) => item.programId) } }).select("title").lean(),
  ]);
  const taskTitle = new Map(tasks.map((task) => [task._id.toString(), task.title]));
  const programTitle = new Map(programs.map((program) => [program._id.toString(), program.title]));

  const recentActivity: ActivityItem[] = recent.map((item) => ({
    kind: item.reviewedAt ? "reviewed" : "submitted",
    at: (item.reviewedAt ?? item.submittedAt).toISOString(),
    taskId: item.taskId.toString(),
    taskTitle: taskTitle.get(item.taskId.toString()) ?? "Task",
    programTitle: programTitle.get(item.programId.toString()) ?? "Program",
    attempt: item.attempt,
    status: item.status,
  }));

  return {
    enrollments: overviews.map(withoutCurriculum),
    stats: {
      activeEnrollments: enrollments.filter((item) => item.status === "active").length,
      completedPrograms: enrollments.filter((item) => item.status === "completed").length,
      pendingTasks,
      awaitingReview,
      reviewedSubmissions,
    },
    recentActivity,
  };
}

export type EnrollmentLearning = { enrollment: EnrollmentOverview; modules: ModuleSummary[] };

/** An enrollment's program outline with per-module and per-task progress. */
export async function getEnrollmentLearning(actor: Actor, enrollmentId: string): Promise<ServiceResult<EnrollmentLearning>> {
  assertStudent(actor);
  await connectToDatabase();
  const studentId = toId(actor.id);
  const enrollment = await findOwnEnrollment(studentId, enrollmentId);
  if (!enrollment) return fail("not_found", NOT_FOUND);

  const [overview] = await buildOverviews(studentId, [enrollment]);
  if (!overview) return fail("not_found", NOT_FOUND);
  const { curriculum, ...enrollmentOverview } = overview;
  if (!curriculum || !overview.progress) return { ok: true, data: { enrollment: enrollmentOverview, modules: [] } };

  const progress = overview.progress;
  const modules = curriculum.modules.map((module) => {
    const id = module._id.toString();
    return {
      id,
      title: module.title,
      description: module.description,
      order: module.order,
      estimatedDurationMinutes: module.estimatedDurationMinutes,
      progress: progress.modules.find((item) => item.id === id)!,
      tasks: curriculum.tasks
        .filter((task) => task.moduleId.equals(module._id))
        .map((task) => toTaskSummary(task, progress.taskStates[task._id.toString()] ?? "not_started")),
    };
  });
  return { ok: true, data: { enrollment: enrollmentOverview, modules } };
}

export type ModuleLearning = {
  enrollment: EnrollmentOverview;
  module: ModuleSummary & { content: string };
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  /** True for reading-only modules the student can still mark as done. */
  canMarkRead: boolean;
};

export async function getModuleLearning(
  actor: Actor,
  enrollmentId: string,
  moduleId: string,
): Promise<ServiceResult<ModuleLearning>> {
  if (!isValidObjectIdString(moduleId)) return fail("not_found", NOT_FOUND);
  const outline = await getEnrollmentLearning(actor, enrollmentId);
  if (!outline.ok) return outline;
  const { enrollment, modules } = outline.data;
  if (enrollment.access === "none") return fail("forbidden", "You do not currently have access to this program.");

  // Only published modules of THIS enrollment's program are in `modules`.
  const index = modules.findIndex((module) => module.id === moduleId);
  if (index === -1) return fail("not_found", NOT_FOUND);

  const doc = await LearningModuleModel.findOne({ _id: toId(moduleId), isPublished: true }).select("content").lean();
  if (!doc) return fail("not_found", NOT_FOUND);

  const summary = modules[index];
  const neighbour = (module: ModuleSummary | undefined) => (module ? { id: module.id, title: module.title } : null);
  return {
    ok: true,
    data: {
      enrollment,
      module: { ...summary, content: doc.content },
      previous: neighbour(modules[index - 1]),
      next: neighbour(modules[index + 1]),
      canMarkRead: enrollment.access === "full" && summary.progress.readingOnly && !summary.progress.complete,
    },
  };
}

/**
 * Marks a READING-ONLY module (no required tasks) as done. Modules with
 * required tasks can only be completed by completing those tasks.
 * Idempotent and safe under concurrent requests.
 */
export async function markModuleRead(actor: Actor, enrollmentId: string, moduleId: string): Promise<ServiceResult<null>> {
  const view = await getModuleLearning(actor, enrollmentId, moduleId);
  if (!view.ok) return view;
  if (view.data.enrollment.access !== "full") {
    return fail("forbidden", "This program is read-only, so progress can no longer be changed.");
  }
  if (!view.data.module.progress.readingOnly) {
    return fail("conflict", "This module is completed by finishing its required tasks.");
  }

  const enrollment = await EnrollmentModel.findById(enrollmentId).select("studentId programId").lean();
  if (!enrollment) return fail("not_found", NOT_FOUND);
  await ensureProgressDocument(enrollment._id, enrollment.studentId, enrollment.programId);
  // Adds the module only if it is not already recorded (no duplicates, even under concurrency).
  await LearningProgressModel.updateOne(
    { enrollmentId: enrollment._id, "readModules.moduleId": { $ne: toId(moduleId) } },
    { $push: { readModules: { moduleId: toId(moduleId), completedAt: new Date() } } },
  );
  await refreshProgressSnapshot(enrollment._id.toString());
  return { ok: true, data: null };
}

async function ensureProgressDocument(enrollmentId: Id, studentId: Id, programId: Id) {
  try {
    await LearningProgressModel.updateOne(
      { enrollmentId },
      { $setOnInsert: { enrollmentId, studentId, programId, readModules: [], snapshot: null } },
      { upsert: true },
    );
  } catch (error) {
    // Two concurrent first writes: the other one created the document.
    if (!isDuplicateKeyError(error)) throw error;
  }
}

/**
 * Recalculates and caches the progress snapshot for an enrollment. Called after
 * every change (submission, review, module read). Pages never rely on it.
 */
export async function refreshProgressSnapshot(enrollmentId: string): Promise<void> {
  await connectToDatabase();
  const enrollment = await EnrollmentModel.findById(enrollmentId).lean<EnrollmentDoc>();
  if (!enrollment) return;
  const [curricula, attempts, readModules] = await Promise.all([
    loadCurricula([enrollment.programId]),
    loadAttempts(enrollment.studentId, [enrollment._id]),
    loadReadModules(enrollment.studentId, [enrollment._id]),
  ]);
  const progress = computeProgress(
    curricula.get(enrollment.programId.toString()) ?? { modules: [], tasks: [] },
    attempts.map((attempt) => ({ taskId: attempt.taskId.toString(), attempt: attempt.attempt, status: attempt.status })),
    readModules.get(enrollment._id.toString()) ?? [],
  );
  await ensureProgressDocument(enrollment._id, enrollment.studentId, enrollment.programId);
  await LearningProgressModel.updateOne(
    { enrollmentId: enrollment._id },
    {
      $set: {
        snapshot: {
          completedModuleIds: progress.modules.filter((module) => module.complete).map((module) => toId(module.id)),
          completedTaskIds: Object.entries(progress.taskStates)
            .filter(([, state]) => state === "completed")
            .map(([id]) => toId(id)),
          totalModules: progress.totalModules,
          percent: progress.percent,
          state: progress.state,
          computedAt: new Date(),
        },
      },
    },
  );
}

/**
 * Refreshes cached snapshots for every enrollment in a program after its
 * learning content changes (best effort, bounded). Pages never depend on it:
 * they always recalculate progress from the current content.
 */
export async function refreshProgramSnapshots(programId: string): Promise<void> {
  if (!isValidObjectIdString(programId)) return;
  await connectToDatabase();
  const enrollments = await EnrollmentModel.find({ programId: toId(programId), status: { $in: ["active", "completed"] } })
    .select("_id")
    .limit(1_000)
    .lean();
  for (const enrollment of enrollments) await refreshProgressSnapshot(enrollment._id.toString());
}

// ---------- Trusted completion check (certificates) ----------

export type EnrollmentCompletion = {
  enrollment: EnrollmentDoc;
  progress: ProgramProgress;
  /** Required tasks (published) that are file uploads, which students cannot submit yet. */
  requiredFileTasks: number;
  /** When the requirements were met: the latest of the completing reviews/submissions and reading marks. */
  completedAt: Date | null;
};

/**
 * Evaluates an enrollment with THE progress rule (src/lib/learning/progress.ts)
 * from server-side records only. For trusted server code (certificate
 * eligibility); callers do their own authorization.
 */
export async function evaluateEnrollmentCompletion(enrollmentId: string): Promise<EnrollmentCompletion | null> {
  if (!isValidObjectIdString(enrollmentId)) return null;
  await connectToDatabase();
  const enrollment = await EnrollmentModel.findById(enrollmentId).lean<EnrollmentDoc>();
  if (!enrollment) return null;
  const [curricula, attempts, progressDoc] = await Promise.all([
    loadCurricula([enrollment.programId]),
    SubmissionModel.find({ studentId: enrollment.studentId, enrollmentId: enrollment._id })
      .select("taskId attempt status submittedAt reviewedAt")
      .lean<Pick<SubmissionRecord, "taskId" | "attempt" | "status" | "submittedAt" | "reviewedAt">[]>(),
    LearningProgressModel.findOne({ enrollmentId: enrollment._id, studentId: enrollment.studentId }).select("readModules").lean(),
  ]);
  const curriculum = curricula.get(enrollment.programId.toString()) ?? { modules: [], tasks: [] };
  const readModules = progressDoc?.readModules ?? [];
  const progress = computeProgress(
    curriculum,
    attempts.map((attempt) => ({ taskId: attempt.taskId.toString(), attempt: attempt.attempt, status: attempt.status })),
    readModules.map((item) => item.moduleId.toString()),
  );

  let completedAt: Date | null = null;
  if (progress.eligibleForCertificate) {
    const dates: number[] = [];
    for (const moduleProgress of progress.modules) {
      if (!moduleProgress.readingOnly) continue;
      const mark = readModules.find((item) => item.moduleId.toString() === moduleProgress.id);
      if (mark) dates.push(mark.completedAt.getTime());
    }
    for (const task of curriculum.tasks) {
      if (!task.required) continue;
      const latest = latestAttempt(attempts.filter((attempt) => attempt.taskId.toString() === task._id.toString()));
      if (latest) dates.push((latest.status === "accepted" ? (latest.reviewedAt ?? latest.submittedAt) : latest.submittedAt).getTime());
    }
    completedAt = dates.length > 0 ? new Date(Math.max(...dates)) : null;
  }

  return {
    enrollment,
    progress,
    requiredFileTasks: curriculum.tasks.filter((task) => task.required && task.taskType === "file").length,
    completedAt,
  };
}

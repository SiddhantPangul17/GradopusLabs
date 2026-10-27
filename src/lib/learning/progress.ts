import type { SubmissionStatus, TaskCompletionRule } from "@/lib/constants";

/*
 * THE progress and eligibility rule for GradOpus Labs. Pure functions (no
 * database), used by every student page and, later, by certificate issuance.
 * Only PUBLISHED modules and tasks are ever passed in.
 *
 * Task state (from the task's latest attempt):
 *   accepted                                   -> completed
 *   submitted / under_review, rule "submission" -> completed
 *   submitted / under_review, rule "review"     -> awaiting_review
 *   changes_requested                           -> changes_requested
 *   rejected                                    -> rejected
 *   no attempts                                 -> not_started
 *
 * Module complete:
 *   - with required tasks: every required task is completed
 *   - without required tasks (reading only): the student marked it as read
 *
 * Program progress % = floor(completed modules / published modules × 100).
 *
 * Program state:
 *   no_content             no published modules yet
 *   requirements_completed every module complete  <- certificate eligibility
 *   awaiting_review        nothing left for the student to do, but at least
 *                          one required task is waiting for a reviewer
 *   in_progress            some work done
 *   not_started            nothing done yet
 *
 * Optional tasks never affect completion or eligibility.
 */

export type ProgressModule = { id: string; order: number };
export type ProgressTask = { id: string; moduleId: string; required: boolean; completionRule: TaskCompletionRule };
export type ProgressSubmission = { taskId: string; attempt: number; status: SubmissionStatus };

export type TaskState = "not_started" | "awaiting_review" | "changes_requested" | "rejected" | "completed";
export type ProgramState = "no_content" | "not_started" | "in_progress" | "awaiting_review" | "requirements_completed";

export type ModuleProgress = {
  id: string;
  complete: boolean;
  /** Reading-only module (no required tasks): completion is "marked as read". */
  readingOnly: boolean;
  requiredTotal: number;
  requiredCompleted: number;
  awaitingReview: number;
};

export type ProgramProgress = {
  state: ProgramState;
  totalModules: number;
  completedModules: number;
  percent: number;
  modules: ModuleProgress[];
  taskStates: Record<string, TaskState>;
  /** First incomplete module in order, if any. */
  nextModuleId: string | null;
  eligibleForCertificate: boolean;
};

export function latestAttempt<T extends { attempt: number }>(attempts: readonly T[]): T | undefined {
  return attempts.reduce<T | undefined>((latest, item) => (!latest || item.attempt > latest.attempt ? item : latest), undefined);
}

export function taskStateFor(
  task: Pick<ProgressTask, "completionRule">,
  attempts: readonly Pick<ProgressSubmission, "attempt" | "status">[],
): TaskState {
  const latest = latestAttempt(attempts);
  if (!latest) return "not_started";
  switch (latest.status) {
    case "accepted":
      return "completed";
    case "submitted":
    case "under_review":
      return task.completionRule === "submission" ? "completed" : "awaiting_review";
    case "changes_requested":
      return "changes_requested";
    case "rejected":
      return "rejected";
  }
}

export function evaluateProgress(input: {
  modules: readonly ProgressModule[];
  tasks: readonly ProgressTask[];
  submissions: readonly ProgressSubmission[];
  readModuleIds: ReadonlySet<string> | readonly string[];
}): ProgramProgress {
  const read = new Set(input.readModuleIds);
  const modules = [...input.modules].sort((a, b) => a.order - b.order);
  const moduleIds = new Set(modules.map((module) => module.id));

  const attemptsByTask = new Map<string, ProgressSubmission[]>();
  for (const submission of input.submissions) {
    const list = attemptsByTask.get(submission.taskId) ?? [];
    list.push(submission);
    attemptsByTask.set(submission.taskId, list);
  }

  const taskStates: Record<string, TaskState> = {};
  for (const task of input.tasks) {
    if (!moduleIds.has(task.moduleId)) continue; // task of an unpublished module
    taskStates[task.id] = taskStateFor(task, attemptsByTask.get(task.id) ?? []);
  }

  const moduleProgress: ModuleProgress[] = modules.map((module) => {
    const required = input.tasks.filter((task) => task.moduleId === module.id && task.required);
    const requiredCompleted = required.filter((task) => taskStates[task.id] === "completed").length;
    const awaitingReview = required.filter((task) => taskStates[task.id] === "awaiting_review").length;
    const readingOnly = required.length === 0;
    return {
      id: module.id,
      readingOnly,
      requiredTotal: required.length,
      requiredCompleted,
      awaitingReview,
      complete: readingOnly ? read.has(module.id) : requiredCompleted === required.length,
    };
  });

  const totalModules = moduleProgress.length;
  const completedModules = moduleProgress.filter((module) => module.complete).length;
  const percent = totalModules === 0 ? 0 : Math.floor((completedModules / totalModules) * 100);

  // "Nothing left for the student to do": every incomplete module is only waiting on reviews.
  const onlyWaiting = moduleProgress.every(
    (module) => module.complete || (!module.readingOnly && module.requiredCompleted + module.awaitingReview === module.requiredTotal),
  );
  const anyActivity =
    completedModules > 0 || Object.values(taskStates).some((state) => state !== "not_started") || read.size > 0;

  let state: ProgramState;
  if (totalModules === 0) state = "no_content";
  else if (completedModules === totalModules) state = "requirements_completed";
  else if (onlyWaiting) state = "awaiting_review";
  else if (anyActivity) state = "in_progress";
  else state = "not_started";

  return {
    state,
    totalModules,
    completedModules,
    percent,
    modules: moduleProgress,
    taskStates,
    nextModuleId: moduleProgress.find((module) => !module.complete)?.id ?? null,
    eligibleForCertificate: state === "requirements_completed",
  };
}

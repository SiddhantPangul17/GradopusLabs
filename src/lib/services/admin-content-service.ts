import "server-only";
import { Types } from "mongoose";
import { formFieldErrors } from "@/lib/admin/form-parsing";
import { publishProblems } from "@/lib/admin/readiness";
import type { ProgramStatus, TaskCompletionRule, TaskType } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { isDuplicateKeyError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/services/audit-log";
import { assertAdmin, type Actor } from "@/lib/services/authorization";
import { refreshProgramSnapshots } from "@/lib/services/learning-service";
import { fail, type ServiceResult } from "@/lib/services/result";
import { moduleFormSchema, taskFormSchema } from "@/lib/validation/admin";
import { isValidObjectIdString } from "@/lib/validation/common";
import { EnrollmentModel } from "@/models/enrollment";
import { LearningModuleModel } from "@/models/learning-module";
import { LearningTaskModel } from "@/models/learning-task";
import { ProgramModel } from "@/models/program";
import { SubmissionModel } from "@/models/submission";

/*
 * Module and task management. Ids are stable (never recreated), so editing,
 * reordering, publishing or unpublishing never resets students' progress or
 * submissions. Every query is scoped to the program (and module), so an id
 * from another program behaves as "not found". Changes that would leave a
 * PUBLISHED program failing its publishing checklist are rolled back.
 */

type Id = Types.ObjectId;
const NOT_FOUND = "Not found.";
const INVALID = "Please correct the highlighted fields.";

export type Direction = "up" | "down";

/** New order of ids after moving one item up or down; null if not found. Pure. */
export function moveInOrder(ids: readonly string[], id: string, direction: Direction): string[] | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  const result = [...ids];
  if (target < 0 || target >= ids.length) return result;
  [result[index], result[target]] = [result[target]!, result[index]!];
  return result;
}

async function findProgram(programId: string) {
  if (!isValidObjectIdString(programId)) return null;
  return ProgramModel.findById(programId).select("title slug status learningOutcomes completionCriteria").lean();
}

async function findModule(programId: Id, moduleId: string) {
  if (!isValidObjectIdString(moduleId)) return null;
  return LearningModuleModel.findOne({ _id: new Types.ObjectId(moduleId), programId }).lean();
}

/** Problems that would stop a published program from staying published (empty otherwise). */
async function publishedProgramProblems(programId: Id): Promise<string[]> {
  const program = await ProgramModel.findById(programId).select("status learningOutcomes completionCriteria").lean();
  if (!program || program.status !== "published") return [];
  const [modules, tasks] = await Promise.all([
    LearningModuleModel.find({ programId }).select("title isPublished content").lean(),
    LearningTaskModel.find({ programId }).select("moduleId title isPublished required taskType instructions description").lean(),
  ]);
  const visible = new Set(modules.filter((mod) => mod.isPublished).map((mod) => mod._id.toString()));
  return publishProblems({
    program,
    modules: modules.map((mod) => ({ id: mod._id.toString(), title: mod.title, isPublished: mod.isPublished, content: mod.content })),
    tasks: tasks.filter((task) => visible.has(task.moduleId.toString())).map((task) => ({ ...task, moduleId: task.moduleId.toString() })),
    fileStorageConfigured: false,
  });
}

function publishedConflict(problems: string[]) {
  return fail("conflict", `This change was not saved because the program is published and must stay complete: ${problems.join(" ")} Unpublish the program first if you need to make this change.`);
}

// ---------- Views ----------

export type AdminModuleItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  order: number;
  isPublished: boolean;
  estimatedDurationMinutes: number | null;
  tasks: { published: number; total: number };
};

export type ProgramRef = { id: string; title: string; slug: string; status: ProgramStatus };

export async function listModulesForAdmin(actor: Actor, programId: string): Promise<ServiceResult<{ program: ProgramRef; modules: AdminModuleItem[] }>> {
  assertAdmin(actor);
  await connectToDatabase();
  const program = await findProgram(programId);
  if (!program) return fail("not_found", NOT_FOUND);
  const modules = await LearningModuleModel.find({ programId: program._id }).select("-content").sort({ order: 1, _id: 1 }).lean();
  const taskCounts = await LearningTaskModel.aggregate<{ _id: Id; total: number; published: number }>([
    { $match: { programId: program._id } },
    { $group: { _id: "$moduleId", total: { $sum: 1 }, published: { $sum: { $cond: ["$isPublished", 1, 0] } } } },
  ]);
  const countsBy = new Map(taskCounts.map((item) => [item._id.toString(), item]));
  return {
    ok: true,
    data: {
      program: { id: program._id.toString(), title: program.title, slug: program.slug, status: program.status },
      modules: modules.map((mod) => ({
        id: mod._id.toString(),
        slug: mod.slug,
        title: mod.title,
        description: mod.description,
        order: mod.order,
        isPublished: mod.isPublished,
        estimatedDurationMinutes: mod.estimatedDurationMinutes,
        tasks: { published: countsBy.get(mod._id.toString())?.published ?? 0, total: countsBy.get(mod._id.toString())?.total ?? 0 },
      })),
    },
  };
}

export type AdminTaskItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  instructions: string;
  order: number;
  taskType: TaskType;
  required: boolean;
  completionRule: TaskCompletionRule;
  dueDate: string | null;
  evaluationCriteria: string[];
  isPublished: boolean;
  submissions: number;
};

export type AdminModuleDetail = {
  program: ProgramRef;
  module: AdminModuleItem & { content: string };
  tasks: AdminTaskItem[];
  /** Active enrolments affected by changes to required tasks or completion rules. */
  activeEnrollments: number;
};

export async function getModuleForAdmin(actor: Actor, programId: string, moduleId: string): Promise<ServiceResult<AdminModuleDetail>> {
  assertAdmin(actor);
  await connectToDatabase();
  const program = await findProgram(programId);
  if (!program) return fail("not_found", NOT_FOUND);
  const mod = await findModule(program._id, moduleId);
  if (!mod) return fail("not_found", NOT_FOUND);

  const [tasks, submissionCounts, activeEnrollments] = await Promise.all([
    LearningTaskModel.find({ programId: program._id, moduleId: mod._id }).sort({ order: 1, _id: 1 }).lean(),
    SubmissionModel.aggregate<{ _id: Id; count: number }>([
      { $match: { moduleId: mod._id } },
      { $group: { _id: "$taskId", count: { $sum: 1 } } },
    ]),
    EnrollmentModel.countDocuments({ programId: program._id, status: "active" }),
  ]);
  const submissionsBy = new Map(submissionCounts.map((item) => [item._id.toString(), item.count]));

  return {
    ok: true,
    data: {
      program: { id: program._id.toString(), title: program.title, slug: program.slug, status: program.status },
      module: {
        id: mod._id.toString(),
        slug: mod.slug,
        title: mod.title,
        description: mod.description,
        order: mod.order,
        isPublished: mod.isPublished,
        estimatedDurationMinutes: mod.estimatedDurationMinutes,
        content: mod.content,
        tasks: { published: tasks.filter((task) => task.isPublished).length, total: tasks.length },
      },
      tasks: tasks.map((task) => ({
        id: task._id.toString(),
        slug: task.slug,
        title: task.title,
        description: task.description,
        instructions: task.instructions,
        order: task.order,
        taskType: task.taskType,
        required: task.required,
        completionRule: task.completionRule,
        dueDate: task.dueDate?.toISOString() ?? null,
        evaluationCriteria: task.evaluationCriteria,
        isPublished: task.isPublished,
        submissions: submissionsBy.get(task._id.toString()) ?? 0,
      })),
      activeEnrollments,
    },
  };
}

// ---------- Modules ----------

export async function createModule(actor: Actor, programId: string, input: Record<string, unknown>): Promise<ServiceResult<{ id: string }>> {
  assertAdmin(actor);
  const parsed = moduleFormSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", INVALID, formFieldErrors(parsed.error));
  await connectToDatabase();
  await LearningModuleModel.init();
  const program = await findProgram(programId);
  if (!program) return fail("not_found", NOT_FOUND);

  const last = await LearningModuleModel.findOne({ programId: program._id }).sort({ order: -1 }).select("order").lean();
  let created;
  try {
    created = await LearningModuleModel.create({ ...parsed.data, programId: program._id, order: (last?.order ?? -1) + 1 });
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail("conflict", INVALID, { slug: "Another mod in this program already uses this slug." });
    throw error;
  }
  await recordAuditEvent({
    actorId: actor.id,
    action: "module.created",
    entityType: "module",
    entityId: created._id,
    metadata: { programSlug: program.slug, slug: created.slug, isPublished: created.isPublished },
  });
  if (created.isPublished) await refreshProgramSnapshots(program._id.toString());
  return { ok: true, data: { id: created._id.toString() } };
}

export async function updateModule(
  actor: Actor,
  programId: string,
  moduleId: string,
  input: Record<string, unknown>,
): Promise<ServiceResult<null>> {
  assertAdmin(actor);
  const parsed = moduleFormSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", INVALID, formFieldErrors(parsed.error));
  await connectToDatabase();
  const program = await findProgram(programId);
  if (!program) return fail("not_found", NOT_FOUND);
  const previous = await findModule(program._id, moduleId);
  if (!previous) return fail("not_found", NOT_FOUND);

  try {
    await LearningModuleModel.updateOne({ _id: previous._id, programId: program._id }, { $set: parsed.data }, { runValidators: true });
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail("conflict", INVALID, { slug: "Another mod in this program already uses this slug." });
    throw error;
  }
  const problems = await publishedProgramProblems(program._id);
  if (problems.length > 0) {
    const { title, slug, description, content, estimatedDurationMinutes, isPublished } = previous;
    await LearningModuleModel.updateOne({ _id: previous._id }, { $set: { title, slug, description, content, estimatedDurationMinutes, isPublished } });
    return publishedConflict(problems);
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: "module.updated",
    entityType: "module",
    entityId: previous._id,
    metadata: { programSlug: program.slug, slug: parsed.data.slug, from: { isPublished: previous.isPublished }, to: { isPublished: parsed.data.isPublished } },
  });
  if (previous.isPublished !== parsed.data.isPublished) await refreshProgramSnapshots(program._id.toString());
  return { ok: true, data: null };
}

export async function setModulePublished(actor: Actor, programId: string, moduleId: string, isPublished: boolean): Promise<ServiceResult<null>> {
  assertAdmin(actor);
  await connectToDatabase();
  const program = await findProgram(programId);
  if (!program) return fail("not_found", NOT_FOUND);
  const mod = await findModule(program._id, moduleId);
  if (!mod) return fail("not_found", NOT_FOUND);
  if (mod.isPublished === isPublished) return { ok: true, data: null };

  await LearningModuleModel.updateOne({ _id: mod._id }, { $set: { isPublished } });
  const problems = await publishedProgramProblems(program._id);
  if (problems.length > 0) {
    await LearningModuleModel.updateOne({ _id: mod._id }, { $set: { isPublished: mod.isPublished } });
    return publishedConflict(problems);
  }
  await recordAuditEvent({
    actorId: actor.id,
    action: "module.updated",
    entityType: "module",
    entityId: mod._id,
    metadata: { programSlug: program.slug, slug: mod.slug, from: { isPublished: mod.isPublished }, to: { isPublished } },
  });
  await refreshProgramSnapshots(program._id.toString());
  return { ok: true, data: null };
}

export async function moveModule(actor: Actor, programId: string, moduleId: string, direction: Direction): Promise<ServiceResult<null>> {
  assertAdmin(actor);
  await connectToDatabase();
  const program = await findProgram(programId);
  if (!program) return fail("not_found", NOT_FOUND);
  const modules = await LearningModuleModel.find({ programId: program._id }).sort({ order: 1, _id: 1 }).select("_id").lean();
  const order = moveInOrder(modules.map((mod) => mod._id.toString()), moduleId, direction);
  if (!order) return fail("not_found", NOT_FOUND);
  // Renumber every module 0..n-1 so the order is always unambiguous.
  await LearningModuleModel.bulkWrite(
    order.map((id, index) => ({ updateOne: { filter: { _id: new Types.ObjectId(id), programId: program._id }, update: { $set: { order: index } } } })),
  );
  await recordAuditEvent({
    actorId: actor.id,
    action: "module.reordered",
    entityType: "module",
    entityId: new Types.ObjectId(moduleId),
    metadata: { programSlug: program.slug, direction },
  });
  return { ok: true, data: null };
}

// ---------- Tasks ----------

function taskFields(data: ReturnType<typeof taskFormSchema.parse>) {
  return { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : null };
}

export async function createTask(
  actor: Actor,
  programId: string,
  moduleId: string,
  input: Record<string, unknown>,
): Promise<ServiceResult<{ id: string }>> {
  assertAdmin(actor);
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", INVALID, formFieldErrors(parsed.error));
  await connectToDatabase();
  await LearningTaskModel.init();
  const program = await findProgram(programId);
  if (!program) return fail("not_found", NOT_FOUND);
  const mod = await findModule(program._id, moduleId);
  if (!mod) return fail("not_found", NOT_FOUND);

  const last = await LearningTaskModel.findOne({ moduleId: mod._id }).sort({ order: -1 }).select("order").lean();
  let created;
  try {
    created = await LearningTaskModel.create({ ...taskFields(parsed.data), programId: program._id, moduleId: mod._id, order: (last?.order ?? -1) + 1 });
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail("conflict", INVALID, { slug: "Another task in this program already uses this slug." });
    throw error;
  }
  const problems = await publishedProgramProblems(program._id);
  if (problems.length > 0) {
    await LearningTaskModel.deleteOne({ _id: created._id }); // just created, nothing references it yet
    return publishedConflict(problems);
  }
  await recordAuditEvent({
    actorId: actor.id,
    action: "task.created",
    entityType: "task",
    entityId: created._id,
    metadata: { programSlug: program.slug, slug: created.slug, required: created.required, isPublished: created.isPublished },
  });
  if (created.isPublished && mod.isPublished) await refreshProgramSnapshots(program._id.toString());
  return { ok: true, data: { id: created._id.toString() } };
}

export async function updateTask(
  actor: Actor,
  programId: string,
  moduleId: string,
  taskId: string,
  input: Record<string, unknown>,
): Promise<ServiceResult<null>> {
  assertAdmin(actor);
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", INVALID, formFieldErrors(parsed.error));
  if (!isValidObjectIdString(taskId)) return fail("not_found", NOT_FOUND);
  await connectToDatabase();
  const program = await findProgram(programId);
  if (!program) return fail("not_found", NOT_FOUND);
  const mod = await findModule(program._id, moduleId);
  if (!mod) return fail("not_found", NOT_FOUND);
  const previous = await LearningTaskModel.findOne({ _id: new Types.ObjectId(taskId), moduleId: mod._id, programId: program._id }).lean();
  if (!previous) return fail("not_found", NOT_FOUND);

  // Existing attempts were made for this submission type; changing it would invalidate them.
  if (parsed.data.taskType !== previous.taskType && (await SubmissionModel.exists({ taskId: previous._id }))) {
    return fail("conflict", INVALID, { taskType: "Students have already submitted this task, so its submission type cannot change." });
  }

  try {
    await LearningTaskModel.updateOne({ _id: previous._id }, { $set: taskFields(parsed.data) }, { runValidators: true });
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail("conflict", INVALID, { slug: "Another task in this program already uses this slug." });
    throw error;
  }
  const problems = await publishedProgramProblems(program._id);
  if (problems.length > 0) {
    const { title, slug, description, instructions, taskType, required, completionRule, dueDate, evaluationCriteria, isPublished } = previous;
    await LearningTaskModel.updateOne(
      { _id: previous._id },
      { $set: { title, slug, description, instructions, taskType, required, completionRule, dueDate, evaluationCriteria, isPublished } },
    );
    return publishedConflict(problems);
  }

  const progressFields = ["required", "completionRule", "isPublished"] as const;
  const progressChanged = progressFields.filter((key) => previous[key] !== parsed.data[key]);
  await recordAuditEvent({
    actorId: actor.id,
    action: "task.updated",
    entityType: "task",
    entityId: previous._id,
    metadata: {
      programSlug: program.slug,
      slug: parsed.data.slug,
      progressFieldsChanged: progressChanged,
      from: Object.fromEntries(progressChanged.map((key) => [key, previous[key]])),
      to: Object.fromEntries(progressChanged.map((key) => [key, parsed.data[key]])),
    },
  });
  if (progressChanged.length > 0) await refreshProgramSnapshots(program._id.toString());
  return { ok: true, data: null };
}

export async function setTaskPublished(
  actor: Actor,
  programId: string,
  moduleId: string,
  taskId: string,
  isPublished: boolean,
): Promise<ServiceResult<null>> {
  assertAdmin(actor);
  if (!isValidObjectIdString(taskId)) return fail("not_found", NOT_FOUND);
  await connectToDatabase();
  const program = await findProgram(programId);
  if (!program) return fail("not_found", NOT_FOUND);
  const mod = await findModule(program._id, moduleId);
  if (!mod) return fail("not_found", NOT_FOUND);
  const task = await LearningTaskModel.findOne({ _id: new Types.ObjectId(taskId), moduleId: mod._id }).lean();
  if (!task) return fail("not_found", NOT_FOUND);
  if (task.isPublished === isPublished) return { ok: true, data: null };

  await LearningTaskModel.updateOne({ _id: task._id }, { $set: { isPublished } });
  const problems = await publishedProgramProblems(program._id);
  if (problems.length > 0) {
    await LearningTaskModel.updateOne({ _id: task._id }, { $set: { isPublished: task.isPublished } });
    return publishedConflict(problems);
  }
  await recordAuditEvent({
    actorId: actor.id,
    action: "task.updated",
    entityType: "task",
    entityId: task._id,
    metadata: { programSlug: program.slug, slug: task.slug, progressFieldsChanged: ["isPublished"], from: { isPublished: task.isPublished }, to: { isPublished } },
  });
  await refreshProgramSnapshots(program._id.toString());
  return { ok: true, data: null };
}

export async function moveTask(actor: Actor, programId: string, moduleId: string, taskId: string, direction: Direction): Promise<ServiceResult<null>> {
  assertAdmin(actor);
  await connectToDatabase();
  const program = await findProgram(programId);
  if (!program) return fail("not_found", NOT_FOUND);
  const mod = await findModule(program._id, moduleId);
  if (!mod) return fail("not_found", NOT_FOUND);
  const tasks = await LearningTaskModel.find({ moduleId: mod._id }).sort({ order: 1, _id: 1 }).select("_id").lean();
  const order = moveInOrder(tasks.map((task) => task._id.toString()), taskId, direction);
  if (!order) return fail("not_found", NOT_FOUND);
  await LearningTaskModel.bulkWrite(
    order.map((id, index) => ({ updateOne: { filter: { _id: new Types.ObjectId(id), moduleId: mod._id }, update: { $set: { order: index } } } })),
  );
  await recordAuditEvent({
    actorId: actor.id,
    action: "task.reordered",
    entityType: "task",
    entityId: new Types.ObjectId(taskId),
    metadata: { programSlug: program.slug, direction },
  });
  return { ok: true, data: null };
}

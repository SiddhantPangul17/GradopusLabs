import "server-only";
import { Types } from "mongoose";
import { ZodError } from "zod";
import { formFieldErrors } from "@/lib/admin/form-parsing";
import { canChangeProgramStatus, publishProblems } from "@/lib/admin/readiness";
import type { EnrollmentStatus, ProgramStatus } from "@/lib/constants";
import { ENROLLMENT_STATUSES } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { ConflictError, isDuplicateKeyError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/services/audit-log";
import { assertAdmin, type Actor } from "@/lib/services/authorization";
import { createProgram, invalidatePublicPrograms } from "@/lib/services/program-service";
import { fail, type ServiceResult } from "@/lib/services/result";
import { programEditSchema, programStatusChangeSchema } from "@/lib/validation/admin";
import { isValidObjectIdString } from "@/lib/validation/common";
import { EnrollmentModel } from "@/models/enrollment";
import { LearningModuleModel } from "@/models/learning-module";
import { LearningTaskModel } from "@/models/learning-task";
import { ProgramModel, type ProgramRecord } from "@/models/program";

/*
 * Program management for administrators. Every function asserts the admin
 * role (in addition to the page/action checks) and records an audit entry.
 * Programs are never deleted: archiving hides them from the catalogue while
 * keeping enrolments, submissions and (future) certificates intact.
 */

/** Maps schema paths to the program form's field names. */
export const PROGRAM_FIELD_MAP: Record<string, string> = {
  price: "priceRupees",
  duration: "durationWeeks",
  "duration.weeks": "durationWeeks",
  "duration.weeklyEffort": "weeklyEffort",
  modules: "syllabus",
  tasks: "sampleTasks",
};

const NOT_FOUND = "Program not found.";
const FILE_STORAGE_CONFIGURED = false;

type ProgramDoc = ProgramRecord & { _id: Types.ObjectId };

export type AdminProgramListItem = {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: ProgramStatus;
  price: number;
  currency: string;
  updatedAt: string;
  enrollments: number;
  modules: { published: number; total: number };
};

export async function listProgramsForAdmin(actor: Actor, filter: { status?: ProgramStatus } = {}): Promise<AdminProgramListItem[]> {
  assertAdmin(actor);
  await connectToDatabase();
  const programs = await ProgramModel.find(filter.status ? { status: filter.status } : {})
    .sort({ updatedAt: -1 })
    .limit(200)
    .select("title slug category status price currency updatedAt")
    .lean<ProgramDoc[]>();
  const ids = programs.map((program) => program._id);
  const [enrollmentCounts, moduleCounts] = await Promise.all([
    EnrollmentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { programId: { $in: ids } } },
      { $group: { _id: "$programId", count: { $sum: 1 } } },
    ]),
    LearningModuleModel.aggregate<{ _id: Types.ObjectId; total: number; published: number }>([
      { $match: { programId: { $in: ids } } },
      { $group: { _id: "$programId", total: { $sum: 1 }, published: { $sum: { $cond: ["$isPublished", 1, 0] } } } },
    ]),
  ]);
  const enrollmentsBy = new Map(enrollmentCounts.map((item) => [item._id.toString(), item.count]));
  const modulesBy = new Map(moduleCounts.map((item) => [item._id.toString(), item]));

  return programs.map((program) => ({
    id: program._id.toString(),
    title: program.title,
    slug: program.slug,
    category: program.category,
    status: program.status,
    price: program.price,
    currency: program.currency,
    updatedAt: program.updatedAt.toISOString(),
    enrollments: enrollmentsBy.get(program._id.toString()) ?? 0,
    modules: { published: modulesBy.get(program._id.toString())?.published ?? 0, total: modulesBy.get(program._id.toString())?.total ?? 0 },
  }));
}

export type AdminProgramDetail = {
  id: string;
  title: string;
  slug: string;
  status: ProgramStatus;
  shortDescription: string;
  description: string;
  category: string;
  difficulty: ProgramRecord["difficulty"];
  durationWeeks: number;
  weeklyEffort: string;
  deliveryFormat: string;
  price: number;
  currency: string;
  learningOutcomes: string[];
  prerequisites: string[];
  audience: string[];
  syllabus: { title: string; topics: string[] }[];
  sampleTasks: { title: string; description: string }[];
  finalProject: string;
  inclusions: string[];
  completionCriteria: string[];
  availability: ProgramRecord["availability"];
  featured: boolean;
  displayOrder: number;
  faqCount: number;
  createdAt: string;
  updatedAt: string;
  stats: {
    enrollments: Record<EnrollmentStatus, number>;
    modules: { published: number; total: number };
    tasks: { published: number; total: number };
  };
  /** Publishing checklist; empty when the program can be published. */
  problems: string[];
};

async function readinessProblems(program: Pick<ProgramRecord, "learningOutcomes" | "completionCriteria">, programId: Types.ObjectId) {
  const [modules, tasks] = await Promise.all([
    LearningModuleModel.find({ programId }).select("title isPublished content").lean(),
    LearningTaskModel.find({ programId }).select("moduleId title isPublished required taskType instructions description").lean(),
  ]);
  const publishedModuleIds = new Set(modules.filter((module) => module.isPublished).map((module) => module._id.toString()));
  return {
    modules,
    tasks,
    problems: publishProblems({
      program,
      modules: modules.map((module) => ({ id: module._id.toString(), title: module.title, isPublished: module.isPublished, content: module.content })),
      // Tasks inside unpublished modules are invisible to students, so they do not count.
      tasks: tasks
        .filter((task) => publishedModuleIds.has(task.moduleId.toString()))
        .map((task) => ({ ...task, moduleId: task.moduleId.toString() })),
      fileStorageConfigured: FILE_STORAGE_CONFIGURED,
    }),
  };
}

export async function getProgramForAdmin(actor: Actor, programId: string): Promise<ServiceResult<AdminProgramDetail>> {
  assertAdmin(actor);
  if (!isValidObjectIdString(programId)) return fail("not_found", NOT_FOUND);
  await connectToDatabase();
  const program = await ProgramModel.findById(programId).lean<ProgramDoc>();
  if (!program) return fail("not_found", NOT_FOUND);

  const [{ modules, tasks, problems }, enrollmentCounts] = await Promise.all([
    readinessProblems(program, program._id),
    EnrollmentModel.aggregate<{ _id: EnrollmentStatus; count: number }>([
      { $match: { programId: program._id } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);
  const enrollments = Object.fromEntries(ENROLLMENT_STATUSES.map((status) => [status, 0])) as Record<EnrollmentStatus, number>;
  for (const item of enrollmentCounts) enrollments[item._id] = item.count;

  return {
    ok: true,
    data: {
      id: program._id.toString(),
      title: program.title,
      slug: program.slug,
      status: program.status,
      shortDescription: program.shortDescription,
      description: program.description,
      category: program.category,
      difficulty: program.difficulty,
      durationWeeks: program.duration.weeks,
      weeklyEffort: program.duration.weeklyEffort,
      deliveryFormat: program.deliveryFormat,
      price: program.price,
      currency: program.currency,
      learningOutcomes: program.learningOutcomes,
      prerequisites: program.prerequisites,
      audience: program.audience,
      syllabus: program.modules.map((module) => ({ title: module.title, topics: module.topics })),
      sampleTasks: program.tasks.map((task) => ({ title: task.title, description: task.description })),
      finalProject: program.finalProject ?? "",
      inclusions: program.inclusions,
      completionCriteria: program.completionCriteria,
      availability: program.availability,
      featured: program.featured,
      displayOrder: program.displayOrder,
      faqCount: program.faqs.length,
      createdAt: program.createdAt.toISOString(),
      updatedAt: program.updatedAt.toISOString(),
      stats: {
        enrollments,
        modules: { published: modules.filter((module) => module.isPublished).length, total: modules.length },
        tasks: { published: tasks.filter((task) => task.isPublished).length, total: tasks.length },
      },
      problems,
    },
  };
}

/** Creates a DRAFT program (publishing is a separate, checked step). */
export async function createProgramAsAdmin(actor: Actor, input: Record<string, unknown>): Promise<ServiceResult<{ id: string }>> {
  assertAdmin(actor);
  const parsed = programEditSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please correct the highlighted fields.", formFieldErrors(parsed.error, PROGRAM_FIELD_MAP));
  try {
    const created = await createProgram({ ...parsed.data, status: "draft", faqs: [] }, actor);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (error instanceof ConflictError) return fail("conflict", "Please correct the highlighted fields.", { slug: "This slug is already used by another program." });
    if (error instanceof ZodError) return fail("invalid", "Please correct the highlighted fields.", formFieldErrors(error, PROGRAM_FIELD_MAP));
    throw error;
  }
}

/** Updates program details. Status changes go through setProgramStatus(). */
export async function updateProgramAsAdmin(
  actor: Actor,
  programId: string,
  input: Record<string, unknown>,
): Promise<ServiceResult<{ slug: string }>> {
  assertAdmin(actor);
  if (!isValidObjectIdString(programId)) return fail("not_found", NOT_FOUND);
  const parsed = programEditSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please correct the highlighted fields.", formFieldErrors(parsed.error, PROGRAM_FIELD_MAP));

  await connectToDatabase();
  const current = await ProgramModel.findById(programId).lean<ProgramDoc>();
  if (!current) return fail("not_found", NOT_FOUND);

  // Public URLs (and links students may have shared) must not break.
  if (current.status !== "draft" && parsed.data.slug !== current.slug) {
    return fail("conflict", "Please correct the highlighted fields.", {
      slug: "The slug cannot change after a program has been published. Archive it and create a new program instead.",
    });
  }
  if (current.status === "published") {
    const { problems } = await readinessProblems(parsed.data, current._id);
    if (problems.length > 0) {
      return fail("conflict", `This program is published, so it must stay complete: ${problems.join(" ")}`);
    }
  }

  const changed = (Object.keys(parsed.data) as (keyof typeof parsed.data)[]).filter(
    (key) => JSON.stringify(parsed.data[key]) !== JSON.stringify(current[key as keyof ProgramDoc]),
  );
  try {
    await ProgramModel.updateOne({ _id: current._id }, { $set: parsed.data }, { runValidators: true });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return fail("conflict", "Please correct the highlighted fields.", { slug: "This slug is already used by another program." });
    }
    throw error;
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: "program.updated",
    entityType: "program",
    entityId: current._id,
    metadata: { slug: parsed.data.slug, changedFields: changed },
  });
  invalidatePublicPrograms();
  return { ok: true, data: { slug: parsed.data.slug } };
}

const STATUS_AUDIT = { published: "program.published", archived: "program.archived", draft: "program.unpublished" } as const;

/**
 * Publishes, archives or unpublishes a program, with confirmation. Publishing
 * requires the readiness checklist to pass. Nothing is deleted.
 */
export async function setProgramStatus(actor: Actor, programId: string, input: unknown): Promise<ServiceResult<{ status: ProgramStatus }>> {
  assertAdmin(actor);
  const parsed = programStatusChangeSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please confirm the change.", formFieldErrors(parsed.error));
  if (!isValidObjectIdString(programId)) return fail("not_found", NOT_FOUND);

  await connectToDatabase();
  const program = await ProgramModel.findById(programId).lean<ProgramDoc>();
  if (!program) return fail("not_found", NOT_FOUND);
  const target = parsed.data.target;
  if (!canChangeProgramStatus(program.status, target)) {
    return fail("conflict", `A ${program.status} program cannot be changed to ${target}.`);
  }
  if (target === "published") {
    const { problems } = await readinessProblems(program, program._id);
    if (problems.length > 0) return fail("conflict", `This program is not ready to publish: ${problems.join(" ")}`);
  }

  // Compare-and-set on the current status, so two admins cannot race each other.
  const result = await ProgramModel.updateOne({ _id: program._id, status: program.status }, { $set: { status: target } });
  if (result.modifiedCount !== 1) return fail("conflict", "The program changed while you were working. Reload and try again.");

  await recordAuditEvent({
    actorId: actor.id,
    action: STATUS_AUDIT[target],
    entityType: "program",
    entityId: program._id,
    metadata: { slug: program.slug, from: program.status, to: target },
  });
  invalidatePublicPrograms();
  return { ok: true, data: { status: target } };
}

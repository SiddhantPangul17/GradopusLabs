import "server-only";
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db/mongodb";
import { recordAuditEvent } from "@/lib/services/audit-log";
import { programPackageSchema } from "@/lib/validation/curriculum";
import { LearningModuleModel } from "@/models/learning-module";
import { LearningTaskModel } from "@/models/learning-task";
import { ProgramModel } from "@/models/program";

/*
 * Imports a program and its learning content (used by `npm run content:import`;
 * the admin dashboard will reuse it). TRUSTED callers only: this function does
 * not check a user's role, so it must never be reachable from a public route.
 *
 * - Matches the program, modules and tasks by slug and updates them in place,
 *   so ids (and therefore students' progress and submissions) are preserved.
 * - Modules/tasks missing from the package are UNPUBLISHED, never deleted,
 *   so submission history stays intact.
 * - Not transactional (multi-document transactions are not assumed); every
 *   step is an idempotent upsert, so re-running the import completes it.
 */

export type ImportSummary = {
  programId: string;
  programSlug: string;
  modules: { upserted: number; unpublished: number };
  tasks: { upserted: number; unpublished: number };
};

export async function importProgramPackage(input: unknown, actor: { actorId: string | null; via: "cli" | "admin" }): Promise<ImportSummary> {
  const pkg = programPackageSchema.parse(input);
  await connectToDatabase();
  await Promise.all([ProgramModel.init(), LearningModuleModel.init(), LearningTaskModel.init()]);

  const program = await ProgramModel.findOneAndUpdate(
    { slug: pkg.program.slug },
    { $set: pkg.program },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  );
  if (!program) throw new Error("Program upsert failed.");

  const moduleIds: Types.ObjectId[] = [];
  const taskIds: Types.ObjectId[] = [];

  for (const [moduleIndex, moduleInput] of pkg.modules.entries()) {
    const { tasks, estimatedDurationMinutes, ...moduleFields } = moduleInput;
    const moduleDoc = await LearningModuleModel.findOneAndUpdate(
      { programId: program._id, slug: moduleInput.slug },
      { $set: { ...moduleFields, order: moduleIndex, estimatedDurationMinutes: estimatedDurationMinutes ?? null } },
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
    );
    if (!moduleDoc) throw new Error(`Module upsert failed: ${moduleInput.slug}`);
    moduleIds.push(moduleDoc._id);

    for (const [taskIndex, taskInput] of tasks.entries()) {
      const { dueDate, maxFileSizeBytes, ...taskFields } = taskInput;
      const task = await LearningTaskModel.findOneAndUpdate(
        { programId: program._id, slug: taskInput.slug },
        {
          $set: {
            ...taskFields,
            moduleId: moduleDoc._id,
            order: taskIndex,
            dueDate: dueDate ? new Date(dueDate) : null,
            maxFileSizeBytes: maxFileSizeBytes ?? null,
          },
        },
        { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
      );
      if (!task) throw new Error(`Task upsert failed: ${taskInput.slug}`);
      taskIds.push(task._id);
    }
  }

  const [modulesUnpublished, tasksUnpublished] = await Promise.all([
    LearningModuleModel.updateMany({ programId: program._id, _id: { $nin: moduleIds }, isPublished: true }, { $set: { isPublished: false } }),
    LearningTaskModel.updateMany({ programId: program._id, _id: { $nin: taskIds }, isPublished: true }, { $set: { isPublished: false } }),
  ]);

  const summary: ImportSummary = {
    programId: program._id.toString(),
    programSlug: program.slug,
    modules: { upserted: moduleIds.length, unpublished: modulesUnpublished.modifiedCount },
    tasks: { upserted: taskIds.length, unpublished: tasksUnpublished.modifiedCount },
  };
  await recordAuditEvent({
    actorId: actor.actorId,
    action: "curriculum.imported",
    entityType: "program",
    entityId: program._id,
    metadata: { via: actor.via, slug: summary.programSlug, status: program.status, modules: summary.modules, tasks: summary.tasks },
  });
  return summary;
}

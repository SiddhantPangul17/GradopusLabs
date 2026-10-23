import { z } from "zod";
import { ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_BYTES, TASK_COMPLETION_RULES, TASK_TYPES } from "@/lib/constants";
import { slugSchema } from "@/lib/validation/common";
import { programInputSchema } from "@/lib/validation/program";

/*
 * A program plus its learning content, as imported by
 * `npm run content:import` (and, later, saved by the admin dashboard).
 * Modules and tasks are matched by slug, so re-importing updates them in
 * place and keeps their ids (and students' progress and submissions).
 */

const text = (max: number) => z.string().trim().max(max);

export const taskImportSchema = z
  .object({
    slug: slugSchema,
    title: text(150).min(1),
    description: text(1_000).default(""),
    instructions: z.string().max(20_000).default(""),
    taskType: z.enum(TASK_TYPES),
    required: z.boolean().default(true),
    completionRule: z.enum(TASK_COMPLETION_RULES).default("review"),
    dueDate: z.iso.datetime({ offset: true }).optional(),
    allowedFileTypes: z.array(z.enum(ALLOWED_UPLOAD_EXTENSIONS)).max(10).default([]),
    maxFileSizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES).optional(),
    evaluationCriteria: z.array(text(300).min(1)).max(20).default([]),
    isPublished: z.boolean().default(true),
  })
  .strict()
  .superRefine((task, ctx) => {
    const fileFields = task.allowedFileTypes.length > 0 || task.maxFileSizeBytes !== undefined;
    if (task.taskType !== "file" && fileFields) {
      ctx.addIssue({ code: "custom", path: ["allowedFileTypes"], message: "File settings are only allowed on file tasks." });
    }
    if (task.taskType === "file" && task.allowedFileTypes.length === 0) {
      ctx.addIssue({ code: "custom", path: ["allowedFileTypes"], message: "File tasks must list the allowed file types." });
    }
  });

export const moduleImportSchema = z
  .object({
    slug: slugSchema,
    title: text(150).min(1),
    description: text(1_000).default(""),
    content: z.string().max(50_000).default(""),
    estimatedDurationMinutes: z.number().int().min(1).max(10_000).optional(),
    isPublished: z.boolean().default(true),
    tasks: z.array(taskImportSchema).max(30).default([]),
  })
  .strict();

export const programPackageSchema = z
  .object({
    program: programInputSchema,
    modules: z.array(moduleImportSchema).max(50),
  })
  .strict()
  .superRefine((pkg, ctx) => {
    const moduleSlugs = new Set<string>();
    const taskSlugs = new Set<string>();
    pkg.modules.forEach((module, moduleIndex) => {
      if (moduleSlugs.has(module.slug)) {
        ctx.addIssue({ code: "custom", path: ["modules", moduleIndex, "slug"], message: `Duplicate module slug "${module.slug}".` });
      }
      moduleSlugs.add(module.slug);
      module.tasks.forEach((task, taskIndex) => {
        // Task slugs are unique per program, not just per module.
        if (taskSlugs.has(task.slug)) {
          ctx.addIssue({
            code: "custom",
            path: ["modules", moduleIndex, "tasks", taskIndex, "slug"],
            message: `Duplicate task slug "${task.slug}".`,
          });
        }
        taskSlugs.add(task.slug);
      });
    });
  });

export type ProgramPackage = z.infer<typeof programPackageSchema>;

import { z } from "zod";
import { PROGRAM_STATUSES, SUBMISSION_STATUSES, TASK_COMPLETION_RULES } from "@/lib/constants";
import { objectIdSchema, slugSchema } from "@/lib/validation/common";
import { programInputSchema } from "@/lib/validation/program";

/*
 * Admin input schemas (authoritative; server-side). Admin identity and role
 * never come from input: they are taken from the verified session.
 */

/** Program edit form: everything except status (separate, confirmed action) and FAQs (preserved). */
export const programEditSchema = programInputSchema.omit({ status: true, faqs: true });

export const programStatusChangeSchema = z
  .object({
    target: z.enum(PROGRAM_STATUSES),
    confirm: z.literal(true, { error: "Tick the box to confirm this change." }),
  })
  .strict();

export const moduleFormSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title.").max(150),
    slug: slugSchema,
    description: z.string().trim().max(1_000).default(""),
    content: z.string().max(50_000, "The content is too long (50,000 characters maximum).").default(""),
    estimatedDurationMinutes: z.number().int("Use whole minutes.").min(1).max(10_000).nullable(),
    isPublished: z.boolean(),
  })
  .strict();

/**
 * Tasks created in the dashboard. "file" is rejected: there is no secure file
 * storage, so file submissions cannot be accepted (see docs/learning.md).
 */
export const taskFormSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title.").max(150),
    slug: slugSchema,
    description: z.string().trim().max(1_000).default(""),
    instructions: z.string().max(20_000, "The instructions are too long (20,000 characters maximum).").default(""),
    taskType: z.enum(["text", "project_url", "file"]).refine((type) => type !== "file", {
      message: "File submissions need secure file storage, which is not configured yet.",
    }),
    required: z.boolean(),
    completionRule: z.enum(TASK_COMPLETION_RULES),
    dueDate: z.iso.datetime({ offset: true }).nullable(),
    evaluationCriteria: z.array(z.string().trim().min(1).max(300)).max(20, "At most 20 criteria."),
    isPublished: z.boolean(),
  })
  .strict();

/** A reviewer's decision. Feedback is required when the student must act on it. */
export const adminReviewSchema = z
  .object({
    status: z.enum(SUBMISSION_STATUSES).exclude(["submitted"]),
    feedback: z.string().trim().max(5_000).default(""),
    score: z.number().int("Use a whole number.").min(0).max(100).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.status === "changes_requested" || value.status === "rejected") && value.feedback.length < 10) {
      ctx.addIssue({
        code: "custom",
        path: ["feedback"],
        message: "Explain what the student needs to change (at least 10 characters).",
      });
    }
    if (value.status === "under_review" && value.score !== null) {
      ctx.addIssue({ code: "custom", path: ["score"], message: "Add a score when you record the decision." });
    }
  });

/** Updating feedback/score on an already-reviewed submission (status unchanged). */
export const feedbackUpdateSchema = z
  .object({
    feedback: z.string().trim().max(5_000),
    score: z.number().int("Use a whole number.").min(0).max(100).nullable(),
  })
  .strict();

export const studentStatusChangeSchema = z
  .object({
    status: z.enum(["active", "suspended"]),
    reason: z.string().trim().min(5, "Give a short reason (at least 5 characters).").max(300),
    confirm: z.literal(true, { error: "Tick the box to confirm this change." }),
  })
  .strict();

export const manualEnrollmentSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email({ error: "Enter the student's email address." })),
    programSlug: slugSchema,
    confirmNoPayment: z.literal(true, { error: "Confirm that this enrollment is granted without online payment." }),
  })
  .strict();

export { objectIdSchema };

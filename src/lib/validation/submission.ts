import { z } from "zod";
import { SUBMISSION_STATUSES } from "@/lib/constants";
import { isSafeProjectUrl, SUBMISSION_LIMITS, SUBMISSION_MESSAGES } from "@/lib/validation/submission-rules";

/*
 * Authoritative validation for student submissions. Students choose only the
 * content; status, score, feedback and reviewer can never be part of the input
 * (`.strict()` rejects them).
 */

export const submissionInputSchema = z.discriminatedUnion("submissionType", [
  z
    .object({
      submissionType: z.literal("text"),
      textContent: z
        .string()
        .trim()
        .min(1, SUBMISSION_MESSAGES.textRequired)
        .max(SUBMISSION_LIMITS.textMax, SUBMISSION_MESSAGES.textTooLong),
    })
    .strict(),
  z
    .object({
      submissionType: z.literal("project_url"),
      projectUrl: z
        .string()
        .trim()
        .min(1, SUBMISSION_MESSAGES.urlRequired)
        .refine(isSafeProjectUrl, SUBMISSION_MESSAGES.urlInvalid),
    })
    .strict(),
]);

export type SubmissionInput = z.infer<typeof submissionInputSchema>;

/** Reviewer decision (admin only; used by the future review screen). */
export const reviewInputSchema = z
  .object({
    status: z.enum(SUBMISSION_STATUSES).exclude(["submitted"]),
    feedback: z.string().trim().max(5_000).optional(),
    score: z.number().int().min(0).max(100).optional(),
  })
  .strict();

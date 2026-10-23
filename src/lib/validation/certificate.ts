import { z } from "zod";
import { objectIdSchema } from "@/lib/validation/common";

/*
 * Admin certificate operations. The acting admin, the student, eligibility and
 * status are never taken from the form: only the enrolment / certificate being
 * acted on, an explicit confirmation and (where needed) a reason.
 */

const confirmed = z.literal(true, { error: "Confirm this action to continue." });
const reason = z
  .string()
  .trim()
  .min(10, "Give a reason of at least 10 characters.")
  .max(500, "Keep the reason under 500 characters.");

export const issueCertificateSchema = z.object({ enrollmentId: objectIdSchema, confirm: confirmed }).strict();
export const revokeCertificateSchema = z.object({ reason, confirm: confirmed }).strict();
export const replaceCertificateSchema = z.object({ reason, confirm: confirmed }).strict();

/** Public lookup input (normalised separately). */
export const certificateLookupSchema = z.string().trim().min(1, "Enter a certificate ID.").max(40, "That is not a certificate ID.");

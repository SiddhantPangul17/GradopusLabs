import { z } from "zod";
import { PAYMENT_MODES, PAYMENT_STATUSES } from "@/lib/constants";
import { objectIdSchema, slugSchema } from "@/lib/validation/common";

/*
 * Browser input for payments. Strict: the browser may only name the program;
 * price, currency, discounts, student, status and amounts are never accepted
 * (any extra field is rejected), because the server reads them from the database.
 */

export const createOrderSchema = z.object({ programSlug: slugSchema }).strict();

const providerId = z.string().regex(/^[A-Za-z0-9_]{1,64}$/, "Invalid reference.");

/** What the provider's checkout hands back to the page. Untrusted until verified on the server. */
export const verifyCheckoutSchema = z
  .object({
    paymentId: objectIdSchema,
    providerOrderId: providerId,
    providerPaymentId: providerId,
    signature: z.string().regex(/^[0-9a-f]{64}$/i, "Invalid signature."),
  })
  .strict();

export const adminPaymentFilterSchema = z.object({
  status: z.enum([...PAYMENT_STATUSES, "attention"]).optional(),
  mode: z.enum(PAYMENT_MODES).optional(),
  programId: objectIdSchema.optional(),
});

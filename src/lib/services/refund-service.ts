import "server-only";
import { assertAdmin, type Actor } from "@/lib/services/authorization";

/*
 * Refunds: NOT IMPLEMENTED. This module fixes the shape of the future
 * workflow so nothing else has to change when it is built.
 *
 * Required workflow (do not shortcut it):
 * 1. An admin requests a refund for a "paid" payment, with a reason and an
 *    amount ≤ the amount paid minus earlier refunds, following the APPROVED
 *    refund policy (the current policy is a draft).
 * 2. The server creates a Refund record ("requested"), then calls the
 *    provider's refund API with an idempotency key. On success it stores the
 *    provider refund id and sets the refund to "pending" and the payment to
 *    "refund_pending". Nothing is "processed" yet.
 * 3. Only a signed provider webhook (or an API fetch) that confirms the
 *    refund moves the refund to "processed" and the payment to "refunded" or
 *    "partially_refunded" (src/lib/payments/state.ts allows only these).
 * 4. Whether access is withdrawn after a refund is a policy decision; any
 *    enrolment change must be explicit and audited.
 * Every step is audited (refund.requested, refund.updated).
 *
 * Changing a status in the database never moves money and must never be
 * used to simulate a refund.
 */

export type RefundRequestResult = { ok: false; reason: "not_implemented"; message: string };

/** Future entry point: (actor, paymentId, { amount, reason }). Always refuses today. */
export async function requestRefund(actor: Actor): Promise<RefundRequestResult> {
  assertAdmin(actor);
  return {
    ok: false,
    reason: "not_implemented",
    message: "Refunds cannot be made from the platform yet (see docs/payments.md).",
  };
}

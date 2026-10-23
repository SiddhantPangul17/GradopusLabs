import type { PaymentStatus } from "@/lib/constants";
import type { ProviderPayment } from "@/lib/payments/types";

/*
 * Payment state rules. Pure functions, shared by the service and unit tests.
 *
 * Provider events can arrive late, twice or out of order, so every update is
 * checked against these transitions and applied with a compare-and-set:
 * - A verified capture beats an earlier local "failed"/"cancelled" (the
 *   provider allows another attempt on the same order, and a UPI payment can
 *   succeed after first being reported as failed).
 * - Nothing moves a payment out of "paid" except a refund state, so a late
 *   failure or authorization event never reverses a verified success.
 * - Refund states only come from the provider (refunds are not implemented).
 */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ["pending", "authorized", "paid", "failed", "cancelled"],
  pending: ["authorized", "paid", "failed", "cancelled"],
  authorized: ["paid", "failed", "cancelled"],
  failed: ["pending", "authorized", "paid"],
  cancelled: ["authorized", "paid"],
  paid: ["refund_pending", "refunded", "partially_refunded"],
  // A failed refund returning a payment to "paid" will be handled by the refund workflow when it exists.
  refund_pending: ["refunded", "partially_refunded"],
  partially_refunded: ["refund_pending", "refunded"],
  refunded: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

/** Statuses from which `to` is allowed; used as the filter of a compare-and-set update. */
export function statusesAllowing(to: PaymentStatus): PaymentStatus[] {
  return (Object.keys(PAYMENT_TRANSITIONS) as PaymentStatus[]).filter((from) => canTransition(from, to));
}

export type ExpectedPayment = { providerOrderId: string | null; amount: number; currency: string };

/**
 * Whether provider data belongs to this local payment: same order, same
 * amount and same currency. Anything else must never grant access.
 */
export function matchesExpected(payment: ProviderPayment, expected: ExpectedPayment): boolean {
  return (
    expected.providerOrderId !== null &&
    payment.orderId === expected.providerOrderId &&
    payment.amount === expected.amount &&
    payment.currency === expected.currency
  );
}

/** Local status a provider payment state leads to (before transition checks). */
export function statusForProviderState(state: ProviderPayment["state"]): PaymentStatus | null {
  switch (state) {
    case "captured":
      return "paid";
    case "authorized":
      return "authorized";
    case "failed":
      return "failed";
    case "created":
      return "pending";
    case "refunded":
      // Refunds are not implemented; a refunded payment is reported for manual follow-up, never applied blindly.
      return null;
  }
}

import type { Status } from "@/components/ui/status-badge";
import type { PaymentAttentionReason, PaymentStatus } from "@/lib/constants";

/* Display labels for payments. A payment is shown as "Paid" only when its status is "paid". */

export const paymentStatusDisplay: Record<PaymentStatus, { label: string; status: Status }> = {
  created: { label: "Not completed", status: "neutral" },
  pending: { label: "Awaiting confirmation", status: "pending" },
  authorized: { label: "Awaiting confirmation", status: "pending" },
  paid: { label: "Paid", status: "success" },
  failed: { label: "Failed", status: "error" },
  cancelled: { label: "Cancelled", status: "neutral" },
  refund_pending: { label: "Refund in progress", status: "pending" },
  refunded: { label: "Refunded", status: "neutral" },
  partially_refunded: { label: "Partly refunded", status: "neutral" },
};

/** Plain-language explanation of a failure code (never the provider's raw message). */
export function paymentFailureText(code: string | null): string | null {
  switch (code) {
    case null:
      return null;
    case "order_not_created":
    case "order_mismatch":
      return "The payment could not be started. No money was taken.";
    case "superseded":
      return "Replaced by a newer payment attempt for the same program.";
    default:
      return "The payment was not completed.";
  }
}

export const attentionText: Record<PaymentAttentionReason, { student: string; admin: string }> = {
  program_unavailable: {
    student:
      "Your payment was received, but the program is no longer available, so access was not granted. We will contact you about a refund or next steps.",
    admin: "Paid after the program was unpublished or archived; no access was granted. Decide on a refund or re-enrolment.",
  },
  already_enrolled: {
    student:
      "Your payment was received, but you already had an enrolment in this program, so this payment may be a duplicate. We will review it and contact you.",
    admin: "Paid while the student already had a current enrolment (possible duplicate payment). Review and refund if appropriate.",
  },
  verification_mismatch: {
    student: "We could not match this payment to your order automatically. We will review it.",
    admin: "Provider data did not match this order's id, amount or currency. Investigate in the provider dashboard.",
  },
};

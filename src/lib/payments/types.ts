import type { PaymentMode, PaymentProviderName } from "@/lib/constants";

/*
 * Provider-independent payment interface. The payment service only talks to
 * this interface, so another gateway can be added by implementing it (and
 * adding its name to PAYMENT_PROVIDERS) without changing checkout,
 * activation or the webhook pipeline.
 */

/** Provider-side payment state, normalised. */
export type ProviderPaymentState = "created" | "authorized" | "captured" | "failed" | "refunded";

/** What the provider says about one payment. Amounts are in the smallest currency unit. */
export type ProviderPayment = {
  id: string;
  orderId: string | null;
  amount: number;
  currency: string;
  state: ProviderPaymentState;
  /** Short provider error code for failures (e.g. "BAD_REQUEST_ERROR"); never the full description. */
  errorCode: string | null;
};

export type ProviderOrder = {
  id: string;
  amount: number;
  currency: string;
};

/** A verified webhook event, reduced to what the service needs. */
export type ProviderWebhookEvent = {
  /** Unique per event; used to ignore duplicate deliveries. */
  eventId: string;
  type: string;
  payment: ProviderPayment | null;
};

/** Options the browser needs to open the provider's checkout. Contains no secrets. */
export type CheckoutOptions = {
  provider: PaymentProviderName;
  mode: PaymentMode;
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
};

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  readonly mode: PaymentMode;
  /** Creates an order for a server-computed amount. `receipt` is our idempotency key. */
  createOrder(input: { amount: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<ProviderOrder>;
  /** Fetches a payment from the provider (the source of truth). */
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  /** Fetches all payment attempts for an order (for reconciling when no payment id is known). */
  fetchOrderPayments(orderId: string): Promise<ProviderPayment[]>;
  /** Checks the signature the checkout returns, binding the payment id to OUR order id. */
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  /** Checks a webhook signature over the exact raw request body. */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
  /** Parses an already verified webhook body. Returns null if it is malformed. */
  parseWebhookEvent(rawBody: string, headers: Headers): ProviderWebhookEvent | null;
  checkoutOptions(order: ProviderOrder): CheckoutOptions;
}

/** The provider could not be reached or returned an unexpected/server error. Outcome unknown: retry later. */
export class PaymentProviderUnavailableError extends Error {
  constructor(readonly operation: string) {
    super(`Payment provider unavailable during ${operation}`);
    this.name = "PaymentProviderUnavailableError";
  }
}

/** The provider rejected the request (4xx). Carries only a short code, never credentials or raw descriptions. */
export class PaymentProviderRejectedError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string,
  ) {
    super(`Payment provider rejected ${operation} (${code})`);
    this.name = "PaymentProviderRejectedError";
  }
}

import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentMode } from "@/lib/constants";
import {
  PaymentProviderRejectedError,
  PaymentProviderUnavailableError,
  type CheckoutOptions,
  type PaymentProvider,
  type ProviderOrder,
  type ProviderPayment,
  type ProviderPaymentState,
  type ProviderWebhookEvent,
} from "@/lib/payments/types";

/*
 * Razorpay (https://razorpay.com/docs/), called through its documented REST
 * API with fetch, so no SDK has access to more than it needs.
 *
 * - Orders:   POST /v1/orders (amount in paise; `receipt` is unique per order)
 * - Payments: GET /v1/payments/:id, GET /v1/orders/:id/payments
 * - Checkout signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret), hex
 * - Webhooks: HMAC-SHA256(raw body, webhook secret) in `X-Razorpay-Signature`;
 *   `x-razorpay-event-id` is unique per event (used to drop duplicates).
 */

const API_BASE = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 8_000;
const STATES: readonly ProviderPaymentState[] = ["created", "authorized", "captured", "failed", "refunded"];
const ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

/** Lowercase hex HMAC-SHA256. */
export function hmacSha256Hex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests. */
function safeEqualHex(expected: string, received: string | null): boolean {
  if (!received || !/^[0-9a-f]{64}$/i.test(received)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Keeps a provider error code short and printable. */
function cleanCode(value: unknown): string | null {
  return typeof value === "string" ? value.replace(/[^A-Z0-9_]/gi, "").slice(0, 64) || null : null;
}

type RazorpayPaymentEntity = {
  id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  error_code?: unknown;
};

/** Keeps only the fields we use; card, UPI, contact and other details are dropped here. */
export function toProviderPayment(entity: RazorpayPaymentEntity | null | undefined): ProviderPayment | null {
  if (!entity || typeof entity !== "object") return null;
  const { id, order_id: orderId, amount, currency, status, error_code: errorCode } = entity;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) return null;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) return null;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  if (typeof status !== "string" || !STATES.includes(status as ProviderPaymentState)) return null;
  return {
    id,
    orderId: typeof orderId === "string" && ID_PATTERN.test(orderId) ? orderId : null,
    amount,
    currency,
    state: status as ProviderPaymentState,
    errorCode: cleanCode(errorCode),
  };
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  private readonly credentials: { keyId: string; keySecret: string; webhookSecret: string };

  constructor(
    credentials: { keyId: string; keySecret: string; webhookSecret: string },
    readonly mode: PaymentMode,
  ) {
    // Copy only what is needed, so no other configuration is kept on the instance.
    this.credentials = { keyId: credentials.keyId, keySecret: credentials.keySecret, webhookSecret: credentials.webhookSecret };
  }

  private async request(operation: string, path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<unknown> {
    const auth = Buffer.from(`${this.credentials.keyId}:${this.credentials.keySecret}`).toString("base64");
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Basic ${auth}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      // Network error or timeout: the outcome is unknown.
      throw new PaymentProviderUnavailableError(operation);
    }

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // Non-JSON body: handled by the status checks below.
    }
    if (response.status >= 500 || response.status === 429) throw new PaymentProviderUnavailableError(operation);
    if (!response.ok) {
      const code = response.status === 401 ? "AUTHENTICATION_FAILED" : cleanCode((data as { error?: { code?: unknown } } | null)?.error?.code);
      throw new PaymentProviderRejectedError(operation, code ?? `HTTP_${response.status}`);
    }
    return data;
  }

  async createOrder(input: { amount: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<ProviderOrder> {
    const data = (await this.request("create order", "/orders", {
      method: "POST",
      body: { amount: input.amount, currency: input.currency, receipt: input.receipt, notes: input.notes },
    })) as { id?: unknown; amount?: unknown; currency?: unknown } | null;
    if (
      !data ||
      typeof data.id !== "string" ||
      !ID_PATTERN.test(data.id) ||
      typeof data.amount !== "number" ||
      typeof data.currency !== "string"
    ) {
      throw new PaymentProviderUnavailableError("create order (unexpected response)");
    }
    return { id: data.id, amount: data.amount, currency: data.currency };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    if (!ID_PATTERN.test(paymentId)) throw new PaymentProviderRejectedError("fetch payment", "INVALID_ID");
    const data = await this.request("fetch payment", `/payments/${paymentId}`, { method: "GET" });
    const payment = toProviderPayment(data as RazorpayPaymentEntity);
    if (!payment) throw new PaymentProviderUnavailableError("fetch payment (unexpected response)");
    return payment;
  }

  async fetchOrderPayments(orderId: string): Promise<ProviderPayment[]> {
    if (!ID_PATTERN.test(orderId)) throw new PaymentProviderRejectedError("fetch order payments", "INVALID_ID");
    const data = (await this.request("fetch order payments", `/orders/${orderId}/payments`, { method: "GET" })) as {
      items?: unknown;
    } | null;
    if (!data || !Array.isArray(data.items)) throw new PaymentProviderUnavailableError("fetch order payments (unexpected response)");
    return data.items
      .map((item) => toProviderPayment(item as RazorpayPaymentEntity))
      .filter((item): item is ProviderPayment => item !== null);
  }

  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean {
    if (!ID_PATTERN.test(input.orderId) || !ID_PATTERN.test(input.paymentId)) return false;
    return safeEqualHex(hmacSha256Hex(this.credentials.keySecret, `${input.orderId}|${input.paymentId}`), input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    return safeEqualHex(hmacSha256Hex(this.credentials.webhookSecret, rawBody), signature);
  }

  parseWebhookEvent(rawBody: string, headers: Headers): ProviderWebhookEvent | null {
    let body: { event?: unknown; payload?: { payment?: { entity?: RazorpayPaymentEntity } } } | null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!body || typeof body.event !== "string" || !/^[a-z_.]{1,64}$/.test(body.event)) return null;
    const header = headers.get("x-razorpay-event-id");
    // The header is documented as unique per event; a hash of the signed body is a stable fallback.
    const eventId =
      header && /^[A-Za-z0-9_-]{1,100}$/.test(header) ? header : `body_${createHash("sha256").update(rawBody).digest("hex")}`;
    return { eventId, type: body.event, payment: toProviderPayment(body.payload?.payment?.entity) };
  }

  checkoutOptions(order: ProviderOrder): CheckoutOptions {
    return {
      provider: this.name,
      mode: this.mode,
      keyId: this.credentials.keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    };
  }
}

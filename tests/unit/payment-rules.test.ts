import { createHmac } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { freshModules } from "../helpers";
import { PAYMENT_STATUSES } from "@/lib/constants";
import { RazorpayProvider } from "@/lib/payments/razorpay";
import { canTransition, matchesExpected, statusesAllowing, statusForProviderState } from "@/lib/payments/state";
import type { ProviderPayment } from "@/lib/payments/types";
import { createOrderSchema, verifyCheckoutSchema } from "@/lib/validation/payment";

const KEY_SECRET = "unit_test_key_secret_value";
const WEBHOOK_SECRET = "unit_test_webhook_secret_value";
const provider = new RazorpayProvider({ keyId: "rzp_test_UNITKEY", keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET }, "test");
const hmac = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex");

const captured = (overrides: Partial<ProviderPayment> = {}): ProviderPayment => ({
  id: "pay_A",
  orderId: "order_A",
  amount: 9900,
  currency: "INR",
  state: "captured",
  errorCode: null,
  ...overrides,
});

describe("payment state machine", () => {
  it("never moves a paid payment back to an unpaid state (late failure / authorization events)", () => {
    for (const to of ["created", "pending", "authorized", "failed", "cancelled"] as const) {
      expect(canTransition("paid", to)).toBe(false);
    }
    expect(PAYMENT_STATUSES.filter((to) => canTransition("paid", to))).toEqual(["refund_pending", "refunded", "partially_refunded"]);
  });

  it("lets a verified capture win over an earlier failure or cancellation", () => {
    expect(canTransition("failed", "paid")).toBe(true);
    expect(canTransition("cancelled", "paid")).toBe(true);
    expect(statusesAllowing("paid").sort()).toEqual(["authorized", "cancelled", "created", "failed", "pending"]);
  });

  it("treats refunded as terminal", () => {
    expect(PAYMENT_STATUSES.some((to) => canTransition("refunded", to))).toBe(false);
  });

  it("maps provider states; refunds are never applied automatically", () => {
    expect(statusForProviderState("captured")).toBe("paid");
    expect(statusForProviderState("authorized")).toBe("authorized");
    expect(statusForProviderState("failed")).toBe("failed");
    expect(statusForProviderState("refunded")).toBeNull();
  });
});

describe("matching provider data to the local order", () => {
  const expected = { providerOrderId: "order_A", amount: 9900, currency: "INR" };
  it("accepts only the same order, amount and currency", () => {
    expect(matchesExpected(captured(), expected)).toBe(true);
    expect(matchesExpected(captured({ orderId: "order_B" }), expected)).toBe(false);
    expect(matchesExpected(captured({ amount: 100 }), expected)).toBe(false);
    expect(matchesExpected(captured({ currency: "USD" }), expected)).toBe(false);
    expect(matchesExpected(captured({ orderId: null }), expected)).toBe(false);
    expect(matchesExpected(captured(), { ...expected, providerOrderId: null })).toBe(false);
  });
});

describe("Razorpay signatures", () => {
  it("accepts a correct checkout signature bound to our order id", () => {
    const signature = hmac(KEY_SECRET, "order_A|pay_A");
    expect(provider.verifyCheckoutSignature({ orderId: "order_A", paymentId: "pay_A", signature })).toBe(true);
  });

  it("rejects forged, reused or malformed checkout signatures", () => {
    const signature = hmac(KEY_SECRET, "order_A|pay_A");
    expect(provider.verifyCheckoutSignature({ orderId: "order_B", paymentId: "pay_A", signature })).toBe(false);
    expect(provider.verifyCheckoutSignature({ orderId: "order_A", paymentId: "pay_B", signature })).toBe(false);
    expect(provider.verifyCheckoutSignature({ orderId: "order_A", paymentId: "pay_A", signature: hmac("wrong-secret", "order_A|pay_A") })).toBe(false);
    expect(provider.verifyCheckoutSignature({ orderId: "order_A", paymentId: "pay_A", signature: "paid" })).toBe(false);
    expect(provider.verifyCheckoutSignature({ orderId: "order_A", paymentId: "pay_A", signature: "" })).toBe(false);
  });

  it("verifies webhooks over the exact raw body", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const signature = hmac(WEBHOOK_SECRET, body);
    expect(provider.verifyWebhookSignature(body, signature)).toBe(true);
    // Re-serialised or modified bodies no longer match.
    expect(provider.verifyWebhookSignature(JSON.stringify(JSON.parse(body), null, 2), signature)).toBe(false);
    expect(provider.verifyWebhookSignature(body.replace("captured", "failed"), signature)).toBe(false);
    expect(provider.verifyWebhookSignature(body, hmac(KEY_SECRET, body))).toBe(false);
    expect(provider.verifyWebhookSignature(body, null)).toBe(false);
  });

  it("keeps only the needed fields from webhook payloads (no card, UPI or contact data)", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_A",
            order_id: "order_A",
            amount: 9900,
            currency: "INR",
            status: "captured",
            card: { last4: "1111", network: "Visa" },
            vpa: "someone@upi",
            email: "s@example.com",
            contact: "+919999999999",
          },
        },
      },
    });
    const event = provider.parseWebhookEvent(body, new Headers({ "x-razorpay-event-id": "evt_123" }));
    expect(event).toEqual({ eventId: "evt_123", type: "payment.captured", payment: captured() });
    // Without the header, a stable hash of the signed body identifies the event.
    const fallback = provider.parseWebhookEvent(body, new Headers());
    expect(fallback?.eventId).toMatch(/^body_[0-9a-f]{64}$/);
    expect(provider.parseWebhookEvent(body, new Headers())?.eventId).toBe(fallback?.eventId);
    expect(provider.parseWebhookEvent("not json", new Headers())).toBeNull();
  });

  it("gives the browser only public checkout options", () => {
    const options = provider.checkoutOptions({ id: "order_A", amount: 9900, currency: "INR" });
    expect(JSON.stringify(options)).not.toContain(KEY_SECRET);
    expect(JSON.stringify(options)).not.toContain(WEBHOOK_SECRET);
    expect(Object.keys(options).sort()).toEqual(["amount", "currency", "keyId", "mode", "orderId", "provider"]);
  });
});

describe("browser input", () => {
  it("accepts only a program slug when creating an order (no price, currency, discount or student)", () => {
    expect(createOrderSchema.safeParse({ programSlug: "web-basics" }).success).toBe(true);
    for (const extra of [{ amount: 100 }, { price: 1 }, { currency: "USD" }, { discount: 9800 }, { studentId: "x" }, { status: "paid" }]) {
      expect(createOrderSchema.safeParse({ programSlug: "web-basics", ...extra }).success).toBe(false);
    }
  });

  it("does not accept a status from the checkout response", () => {
    const base = { paymentId: "a".repeat(24), providerOrderId: "order_A", providerPaymentId: "pay_A", signature: "f".repeat(64) };
    expect(verifyCheckoutSchema.safeParse(base).success).toBe(true);
    expect(verifyCheckoutSchema.safeParse({ ...base, status: "paid" }).success).toBe(false);
    expect(verifyCheckoutSchema.safeParse({ ...base, signature: "paid" }).success).toBe(false);
  });
});

describe("payment configuration", () => {
  const base = { PAYMENT_PROVIDER: "razorpay", PAYMENT_KEY_SECRET: "secret_one_value", PAYMENT_WEBHOOK_SECRET: "secret_two_value" };
  async function config(env: Record<string, string | undefined>) {
    await freshModules(env);
    return (await import("@/lib/payments/config")).getPaymentConfig();
  }

  it("is off without a provider", async () => {
    expect((await config({ PAYMENT_PROVIDER: undefined })).status).toBe("disabled");
  });

  it("defaults to test mode and accepts test keys", async () => {
    const result = await config({ ...base, PAYMENT_KEY_ID: "rzp_test_ABCDEFGH", PAYMENT_MODE: undefined });
    expect(result).toMatchObject({ status: "ready", mode: "test" });
  });

  it("never enables live payments just because live keys are present", async () => {
    expect((await config({ ...base, PAYMENT_KEY_ID: "rzp_live_ABCDEFGH", PAYMENT_MODE: undefined })).status).toBe("misconfigured");
    expect((await config({ ...base, PAYMENT_KEY_ID: "rzp_live_ABCDEFGH", PAYMENT_MODE: "test" })).status).toBe("misconfigured");
    expect((await config({ ...base, PAYMENT_KEY_ID: "rzp_test_ABCDEFGH", PAYMENT_MODE: "live" })).status).toBe("misconfigured");
    expect(await config({ ...base, PAYMENT_KEY_ID: "rzp_live_ABCDEFGH", PAYMENT_MODE: "live" })).toMatchObject({ status: "ready", mode: "live" });
  });

  it("requires every secret, and distinct secrets", async () => {
    expect((await config({ ...base, PAYMENT_KEY_ID: "rzp_test_ABCDEFGH", PAYMENT_WEBHOOK_SECRET: undefined })).status).toBe("misconfigured");
    expect(
      (await config({ ...base, PAYMENT_KEY_ID: "rzp_test_ABCDEFGH", PAYMENT_WEBHOOK_SECRET: base.PAYMENT_KEY_SECRET })).status,
    ).toBe("misconfigured");
  });

  it("availability exposes the mode only, never keys", async () => {
    await freshModules({ ...base, PAYMENT_KEY_ID: "rzp_test_ABCDEFGH" });
    const availability = (await import("@/lib/payments/config")).getPaymentAvailability();
    expect(availability).toEqual({ available: true, mode: "test" });
  });
});

describe("secrets stay on the server", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  const sources = files(join(process.cwd(), "src")).filter((path) => /\.(ts|tsx)$/.test(path));

  it("no NEXT_PUBLIC_ variable is used for payment settings", () => {
    for (const path of sources) expect(readFileSync(path, "utf8")).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(PAYMENT|KEY|SECRET|RAZORPAY)/);
    expect(readFileSync(join(process.cwd(), ".env.example"), "utf8")).not.toMatch(/^[ \t]*NEXT_PUBLIC_/m);
  });

  it("client components never read the environment or payment configuration", () => {
    const clientFiles = sources.filter((path) => /^["']use client["']/.test(readFileSync(path, "utf8").trimStart()));
    expect(clientFiles.length).toBeGreaterThan(0);
    for (const path of clientFiles) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/process\.env|@\/lib\/payments\/(config|provider|razorpay)|@\/lib\/env/);
    }
  });

  it("payment config, provider and service modules are server-only", () => {
    for (const file of ["lib/payments/config.ts", "lib/payments/provider.ts", "lib/payments/razorpay.ts", "lib/services/payment-service.ts"]) {
      expect(readFileSync(join(process.cwd(), "src", file), "utf8")).toMatch(/^import "server-only";/);
    }
  });
});

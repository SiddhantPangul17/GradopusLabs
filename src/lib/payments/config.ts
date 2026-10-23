import "server-only";
import type { PaymentMode, PaymentProviderName } from "@/lib/constants";
import { getServerEnv } from "@/lib/env";

/*
 * Payment configuration. Payments are OFF unless every variable is present
 * and consistent. Live payments additionally need an explicit
 * PAYMENT_MODE=live together with live keys: the presence of keys never
 * switches live payments on, and test keys never run in live mode (or the
 * other way round).
 *
 * The secrets returned here must stay on the server. Only `keyId` (which the
 * provider designs to be public) is ever sent to the browser.
 */

export type PaymentConfig =
  | {
      status: "ready";
      provider: PaymentProviderName;
      mode: PaymentMode;
      keyId: string;
      keySecret: string;
      webhookSecret: string;
    }
  | { status: "disabled" | "misconfigured"; reason: string };

/** Razorpay key ids are prefixed with the mode they belong to. */
const KEY_PREFIX: Record<PaymentMode, string> = { test: "rzp_test_", live: "rzp_live_" };

let reported = false;

export function getPaymentConfig(): PaymentConfig {
  const env = getServerEnv();
  if (!env.PAYMENT_PROVIDER) return { status: "disabled", reason: "PAYMENT_PROVIDER is not set" };

  const mode: PaymentMode = env.PAYMENT_MODE ?? "test";
  const missing = (["PAYMENT_KEY_ID", "PAYMENT_KEY_SECRET", "PAYMENT_WEBHOOK_SECRET"] as const).filter((key) => !env[key]);
  if (missing.length > 0) return misconfigured(`missing ${missing.join(", ")}`);

  const keyId = env.PAYMENT_KEY_ID as string;
  if (!keyId.startsWith(KEY_PREFIX[mode])) {
    // Names the mode only; never the key itself.
    return misconfigured(`PAYMENT_KEY_ID is not a ${mode}-mode key (PAYMENT_MODE=${mode})`);
  }
  if (env.PAYMENT_KEY_SECRET === env.PAYMENT_WEBHOOK_SECRET) {
    return misconfigured("PAYMENT_WEBHOOK_SECRET must differ from PAYMENT_KEY_SECRET");
  }

  return {
    status: "ready",
    provider: env.PAYMENT_PROVIDER,
    mode,
    keyId,
    keySecret: env.PAYMENT_KEY_SECRET as string,
    webhookSecret: env.PAYMENT_WEBHOOK_SECRET as string,
  };
}

function misconfigured(reason: string): PaymentConfig {
  if (!reported) {
    reported = true;
    console.error(`[payments] Online payments are disabled: ${reason}. See docs/payments.md.`);
  }
  return { status: "misconfigured", reason };
}

/** Public, non-secret description of the payment setup for pages. */
export type PaymentAvailability = { available: true; mode: PaymentMode } | { available: false };

export function getPaymentAvailability(): PaymentAvailability {
  const config = getPaymentConfig();
  return config.status === "ready" ? { available: true, mode: config.mode } : { available: false };
}

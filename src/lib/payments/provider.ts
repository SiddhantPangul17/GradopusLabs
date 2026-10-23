import "server-only";
import { getPaymentConfig } from "@/lib/payments/config";
import { RazorpayProvider } from "@/lib/payments/razorpay";
import type { PaymentProvider } from "@/lib/payments/types";

/** The configured provider, or null when payments are off or misconfigured (never a fake provider). */
export function getPaymentProvider(): PaymentProvider | null {
  const config = getPaymentConfig();
  if (config.status !== "ready") return null;
  switch (config.provider) {
    case "razorpay":
      return new RazorpayProvider(config, config.mode);
  }
}

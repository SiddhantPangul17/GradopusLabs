"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { brand } from "@/config/brand";

/*
 * Opens the provider's official checkout (Razorpay Checkout.js) for an order
 * created on the server. The browser only sends the program slug; the order,
 * amount and public key come back from the server. Whatever the checkout
 * reports is sent to the server for verification, and the page then shows
 * what the SERVER knows. Nothing here can mark a payment as paid.
 */

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type CheckoutResponse = {
  payment: { id: string };
  checkout: {
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    prefill: { name: string; email: string };
  };
};

type RazorpayHandlerResponse = { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string };
type RazorpayInstance = { open(): void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

let scriptPromise: Promise<RazorpayConstructor> | null = null;

function loadCheckoutScript(): Promise<RazorpayConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  scriptPromise ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => {
      const loaded = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
      if (loaded) resolve(loaded);
      else reject(new Error("Checkout unavailable"));
    };
    script.onerror = () => reject(new Error("Checkout unavailable"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

async function postJson(url: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let data: Record<string, unknown> | null = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON error page: handled by the status.
  }
  return { status: response.status, data };
}

export function CheckoutButton({ programSlug, label = "Pay and enroll" }: { programSlug: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultUrl = (paymentId: string, extra = "") =>
    `/checkout/${encodeURIComponent(programSlug)}?payment=${encodeURIComponent(paymentId)}${extra}`;

  async function start() {
    setBusy(true);
    setError(null);
    let session: CheckoutResponse;
    try {
      const { status, data } = await postJson("/api/payments/create-order", { programSlug });
      if (status !== 200 || !data) {
        setError(typeof data?.message === "string" ? data.message : "We could not start the payment. No money has been taken.");
        if (status === 409) router.refresh();
        setBusy(false);
        return;
      }
      session = data as unknown as CheckoutResponse;
    } catch {
      setError("We could not reach the server. Check your connection and try again. No money has been taken.");
      setBusy(false);
      return;
    }

    let Razorpay: RazorpayConstructor;
    try {
      Razorpay = await loadCheckoutScript();
    } catch {
      setError("The payment window could not be loaded. Check your connection or disable content blockers, then try again. No money has been taken.");
      setBusy(false);
      return;
    }

    const paymentId = session.payment.id;
    let settled = false;
    const checkout = new Razorpay({
      key: session.checkout.keyId,
      order_id: session.checkout.orderId,
      amount: session.checkout.amount,
      currency: session.checkout.currency,
      name: session.checkout.name,
      description: session.checkout.description,
      prefill: session.checkout.prefill,
      theme: { color: brand.theme.colors.primary },
      handler: async (response: RazorpayHandlerResponse) => {
        settled = true;
        try {
          // The server checks the signature and asks the provider; the result page shows what it decided.
          await postJson("/api/payments/verify", {
            paymentId,
            providerOrderId: response.razorpay_order_id,
            providerPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
        } catch {
          // The webhook or "check again" confirms it later.
        }
        router.push(resultUrl(paymentId));
      },
      modal: {
        ondismiss: () => {
          if (settled) return;
          setBusy(false);
          router.push(resultUrl(paymentId, "&closed=1"));
        },
      },
    });
    checkout.open();
  }

  return (
    <div className="space-y-3">
      <div role="status" aria-live="polite">
        {error && (
          <Notice tone="error" title="Payment not started">
            {error}
          </Notice>
        )}
      </div>
      <Button size="lg" fullWidth loading={busy} loadingText="Opening secure payment…" onClick={start}>
        {label}
      </Button>
    </div>
  );
}

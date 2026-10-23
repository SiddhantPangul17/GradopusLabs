"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/*
 * Keeps an unconfirmed payment's page up to date. It only READS the status
 * the server has stored (normally updated by the provider's webhook) and
 * re-renders the page when it changes. "Check again" asks the server to query
 * the provider; it never sends a status of its own.
 */

const POLL_MS = 4_000;
const POLL_FOR_MS = 2 * 60 * 1000;

export function PaymentStatusWatcher({ paymentId, status, poll = true }: { paymentId: string; status: string; poll?: boolean }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!poll) return;
    startedAt.current = Date.now();
    let stopped = false;
    const timer = window.setInterval(async () => {
      if (stopped) return;
      if (Date.now() - startedAt.current > POLL_FOR_MS) {
        window.clearInterval(timer);
        setMessage("Still waiting for confirmation. You can leave this page; the payment will be confirmed automatically, and you can check again later.");
        return;
      }
      try {
        const response = await fetch(`/api/payments/${encodeURIComponent(paymentId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { payment?: { status?: string; enrollmentId?: string | null } };
        if (data.payment && (data.payment.status !== status || data.payment.enrollmentId)) {
          stopped = true;
          window.clearInterval(timer);
          router.refresh();
        }
      } catch {
        // Offline for a moment: try again on the next tick.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [paymentId, status, poll, router]);

  async function checkAgain() {
    setChecking(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(paymentId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconcile" }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as { message?: string; payment?: { status?: string } } | null;
      if (!response.ok) {
        setMessage(data?.message ?? "We could not check the payment right now. Please try again later.");
      } else if (data?.payment?.status === status) {
        setMessage("No change yet. If you completed the payment, it will be confirmed automatically.");
      }
      router.refresh();
    } catch {
      setMessage("We could not reach the server. Please try again later.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" onClick={checkAgain} loading={checking} loadingText="Checking…">
        Check payment status
      </Button>
      <p role="status" aria-live="polite" className="type-supporting text-muted">
        {message}
      </p>
    </div>
  );
}

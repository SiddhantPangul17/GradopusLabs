import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { PageContainer } from "@/components/layout/page-container";
import { CheckoutButton } from "@/components/payments/checkout-button";
import { PaymentStatusWatcher } from "@/components/payments/payment-status-watcher";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/learning/labels";
import { attentionText, paymentFailureText, paymentStatusDisplay } from "@/lib/payments/labels";
import { programHref } from "@/lib/program-display";
import { getCheckoutState, getPaymentForViewer, type PaymentView } from "@/lib/services/payment-service";
import { formatMinorUnits } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

type Props = PageProps<"/checkout/[programSlug]">;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="type-page-title wrap-anywhere text-foreground">{title}</h1>
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}

function TestModeNotice() {
  return (
    <Notice tone="warning" title="Test mode: no real money is charged">
      Payments run in the payment provider&apos;s test mode. Use the provider&apos;s test cards or UPI ids; real cards are
      not charged.
    </Notice>
  );
}

function PaymentFacts({ payment }: { payment: PaymentView }) {
  const status = paymentStatusDisplay[payment.status];
  return (
    <dl className="grid gap-3 rounded-card border border-border bg-surface p-4 type-supporting sm:grid-cols-2">
      <div>
        <dt className="text-muted">Program</dt>
        <dd className="font-medium wrap-anywhere text-foreground">{payment.program.title}</dd>
      </div>
      <div>
        <dt className="text-muted">Amount</dt>
        <dd className="font-medium text-foreground">{formatMinorUnits(payment.amount, payment.currency)}</dd>
      </div>
      <div>
        <dt className="text-muted">Status</dt>
        <dd className="mt-1">
          <StatusBadge status={status.status}>{status.label}</StatusBadge>
        </dd>
      </div>
      <div>
        <dt className="text-muted">Order reference</dt>
        <dd className="font-mono text-foreground wrap-anywhere">{payment.providerOrderId ?? "Not created"}</dd>
      </div>
      <div>
        <dt className="text-muted">Started</dt>
        <dd className="text-foreground">
          <time dateTime={payment.createdAt}>{formatDateTime(payment.createdAt)}</time>
        </dd>
      </div>
      {payment.paidAt && (
        <div>
          <dt className="text-muted">Confirmed</dt>
          <dd className="text-foreground">
            <time dateTime={payment.paidAt}>{formatDateTime(payment.paidAt)}</time>
          </dd>
        </div>
      )}
    </dl>
  );
}

/** Result of one payment: shows only what the server has verified. Reading it never creates an order. */
async function PaymentResult({ programSlug, paymentId, closed }: { programSlug: string; paymentId: string; closed: boolean }) {
  const user = await requireStudent(`/checkout/${encodeURIComponent(programSlug)}`);
  const payment = await getPaymentForViewer({ id: user.id, role: user.role }, paymentId);
  // Someone else's payment, or one for another program, looks the same as a missing one.
  if (!payment || payment.program.slug !== programSlug) notFound();

  const testMode = payment.mode === "test" ? <TestModeNotice /> : null;
  const retry = <CheckoutButton programSlug={programSlug} label="Try the payment again" />;

  if (payment.status === "paid") {
    if (payment.enrollmentId) {
      return (
        <Shell title="Payment confirmed">
          <Notice tone="success" title="You are enrolled">
            We have confirmed your payment with the payment provider and your enrolment in {payment.program.title} is active.
          </Notice>
          <PaymentFacts payment={payment} />
          <ButtonLink href={`/student/programs/${payment.enrollmentId}`} size="lg">
            Start learning
          </ButtonLink>
        </Shell>
      );
    }
    if (payment.attentionReason) {
      return (
        <Shell title="Payment received">
          <Notice tone="warning" title="Your enrolment needs our attention">
            {attentionText[payment.attentionReason].student} Keep the order reference below. You can also{" "}
            <Link href="/contact" className="font-semibold underline underline-offset-2">
              contact us
            </Link>
            .
          </Notice>
          <PaymentFacts payment={payment} />
        </Shell>
      );
    }
    return (
      <Shell title="Payment confirmed">
        <Notice tone="info" title="Setting up your access">
          Your payment is confirmed. Your enrolment is being set up; this page updates automatically.
        </Notice>
        <PaymentFacts payment={payment} />
        <PaymentStatusWatcher paymentId={payment.id} status={payment.status} />
      </Shell>
    );
  }

  if (payment.status === "pending" || payment.status === "authorized") {
    return (
      <Shell title="Confirming your payment">
        {testMode}
        <Notice tone="info" title="Waiting for confirmation from the payment provider">
          We have not confirmed this payment yet, so you are not enrolled yet. This usually takes a few seconds but can
          take longer. <strong>Please do not pay again.</strong> This page updates automatically.
        </Notice>
        <PaymentFacts payment={payment} />
        <PaymentStatusWatcher paymentId={payment.id} status={payment.status} />
      </Shell>
    );
  }

  if (payment.status === "created") {
    return (
      <Shell title="Payment not completed">
        {testMode}
        <Notice tone="info" title={closed ? "The payment window was closed" : "No payment received yet"}>
          We have not received a confirmed payment for this order, so you are not enrolled. If money left your account, it
          will be confirmed automatically once the payment provider tells us; check the status before paying again.
        </Notice>
        <PaymentFacts payment={payment} />
        <PaymentStatusWatcher paymentId={payment.id} status={payment.status} poll={closed} />
        {retry}
      </Shell>
    );
  }

  if (payment.status === "failed" || payment.status === "cancelled") {
    return (
      <Shell title={payment.status === "failed" ? "Payment failed" : "Payment cancelled"}>
        {testMode}
        <Notice tone={payment.status === "failed" ? "error" : "info"} title="You have not been enrolled">
          {paymentFailureText(payment.failureCode) ?? "The payment was not completed."} If money left your account for
          this attempt, please{" "}
          <Link href="/contact" className="font-semibold underline underline-offset-2">
            contact us
          </Link>{" "}
          with the order reference.
        </Notice>
        <PaymentFacts payment={payment} />
        {retry}
      </Shell>
    );
  }

  // Refund states: shown as they are; refunds are handled outside the platform for now.
  return (
    <Shell title="Payment details">
      <PaymentFacts payment={payment} />
      <ButtonLink href="/student/payments" variant="outline">
        All my payments
      </ButtonLink>
    </Shell>
  );
}

/** The order summary. Read-only: the order is created only when the student presses "Pay". */
async function Checkout({ programSlug }: { programSlug: string }) {
  const user = await requireStudent(`/checkout/${encodeURIComponent(programSlug)}`);
  const state = await getCheckoutState({ id: user.id, role: user.role }, programSlug);
  if (state.kind === "not_found") notFound();

  if (state.kind === "already_enrolled") {
    return (
      <Shell title="You are already enrolled">
        <Notice tone="success" title={state.programTitle}>
          You already have access to this program. There is nothing to pay.
        </Notice>
        <ButtonLink href={`/student/programs/${state.enrollmentId}`} size="lg">
          Go to the program
        </ButtonLink>
      </Shell>
    );
  }

  const { program, payments, openPayment, unresolvedPaidPayment } = state;
  const price = formatMinorUnits(program.amount, program.currency);

  let action: ReactNode;
  if (unresolvedPaidPayment) {
    action = (
      <Notice tone="warning" title="You have already paid for this program">
        A confirmed payment for this program is waiting for our review. Please do not pay again.{" "}
        <Link href={`/checkout/${encodeURIComponent(program.slug)}?payment=${unresolvedPaidPayment.id}`} className="font-semibold underline underline-offset-2">
          View that payment
        </Link>
        .
      </Notice>
    );
  } else if (!program.purchasable) {
    action = (
      <Notice tone="info" title="Enrolment is not open">
        This program cannot be paid for online right now.
      </Notice>
    );
  } else if (!payments.available) {
    action = (
      <Notice tone="info" title="Online payment is not available yet">
        Payments cannot be made on this website at the moment. No payment will be taken.
      </Notice>
    );
  } else if (openPayment && openPayment.status !== "created") {
    action = (
      <Notice tone="info" title="A payment is already being confirmed">
        Please do not pay again.{" "}
        <Link href={`/checkout/${encodeURIComponent(program.slug)}?payment=${openPayment.id}`} className="font-semibold underline underline-offset-2">
          Check its status
        </Link>
        .
      </Notice>
    );
  } else {
    action = <CheckoutButton programSlug={program.slug} label={`Pay ${price} and enrol`} />;
  }

  return (
    <Shell title="Checkout">
      {payments.available && payments.mode === "test" && <TestModeNotice />}

      <Card as="section" elevated aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="type-label text-muted">
          Order summary
        </h2>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-4">
          <Link href={programHref(program.slug)} className="type-card-title wrap-anywhere text-foreground hover:underline">
            {program.title}
          </Link>
          <span className="type-body text-foreground">{price}</span>
        </div>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className="type-label text-foreground">Amount payable</span>
          <span className="text-2xl font-bold tracking-tight text-foreground">{price}</span>
        </div>
        <p className="type-supporting mt-2 text-muted">
          This is the amount you will be charged, as set for this program. Payment is handled by our payment provider;
          card and UPI details are entered on their secure window and never reach our servers.
        </p>
        <div className="mt-5">{action}</div>
      </Card>

      <Notice title="Before you pay">
        Enrolment fees are not refundable, except in the cases set out in our{" "}
        <Link href="/refund-policy" className="font-semibold underline underline-offset-2">
          Payment, Refund &amp; Stipend Policy
        </Link>
        . Please read it and the{" "}
        <Link href="/terms" className="font-semibold underline underline-offset-2">
          Student Terms &amp; Conditions
        </Link>{" "}
        before paying.
      </Notice>
    </Shell>
  );
}

async function CheckoutRoute({ params, searchParams }: Props) {
  const [{ programSlug }, query] = await Promise.all([params, searchParams]);
  const paymentId = first(query.payment);
  if (paymentId) return <PaymentResult programSlug={programSlug} paymentId={paymentId} closed={first(query.closed) === "1"} />;
  return <Checkout programSlug={programSlug} />;
}

export default function CheckoutPage(props: Props) {
  return (
    <PageContainer className="py-10 sm:py-14">
      <Suspense fallback={<AuthFormFallback />}>
        <CheckoutRoute {...props} />
      </Suspense>
    </PageContainer>
  );
}

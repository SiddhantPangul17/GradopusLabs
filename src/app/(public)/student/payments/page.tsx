import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/learning/labels";
import { attentionText, paymentFailureText, paymentStatusDisplay } from "@/lib/payments/labels";
import { listOwnPayments } from "@/lib/services/payment-service";
import { formatMinorUnits } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My payments",
  robots: { index: false },
};

async function Payments({ searchParams }: { searchParams: PageProps<"/student/payments">["searchParams"] }) {
  const user = await requireStudent("/student/payments");
  const raw = (await searchParams).page;
  const requested = Number.parseInt(Array.isArray(raw) ? (raw[0] ?? "1") : (raw ?? "1"), 10);
  // Payment records only; never inferred from enrolments (manual enrolments involve no payment).
  const { items, page, totalPages, total } = await listOwnPayments({ id: user.id, role: user.role }, requested);

  return (
    <>
      <SectionHeading
        as="h1"
        title="My payments"
        description="Every online payment attempt, newest first. Only payments confirmed by the payment provider are shown as paid."
      />

      {total === 0 ? (
        <EmptyState
          className="mt-8"
          title="No payments yet"
          description="When you pay for a program online, the payment will appear here."
          action={
            <ButtonLink href="/programs" variant="outline">
              Browse programs
            </ButtonLink>
          }
        />
      ) : (
        <>
          <p className="type-supporting mt-6 text-muted" aria-live="polite">
            {total} {total === 1 ? "payment" : "payments"} · page {page} of {totalPages}
          </p>
          <ul className="mt-4 divide-y divide-border rounded-card border border-border">
            {items.map((item) => {
              const status = paymentStatusDisplay[item.status];
              const note = item.attentionReason
                ? attentionText[item.attentionReason].student
                : item.status === "failed" || item.status === "cancelled"
                  ? paymentFailureText(item.failureCode)
                  : null;
              return (
                <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="type-label wrap-anywhere text-foreground">
                      {item.program.slug ? (
                        <Link
                          href={`/checkout/${encodeURIComponent(item.program.slug)}?payment=${item.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {item.program.title}
                        </Link>
                      ) : (
                        item.program.title
                      )}{" "}
                      <span className="font-normal text-muted">· {formatMinorUnits(item.amount, item.currency)}</span>
                    </p>
                    <p className="type-meta mt-1 wrap-anywhere text-muted">
                      Started <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                      {item.paidAt && (
                        <>
                          {" "}
                          · confirmed <time dateTime={item.paidAt}>{formatDateTime(item.paidAt)}</time>
                        </>
                      )}
                      {item.providerOrderId && <> · ref {item.providerOrderId}</>}
                      {item.mode === "test" && " · test mode (no real money)"}
                    </p>
                    {note && <p className="type-supporting mt-2 text-foreground">{note}</p>}
                    {item.enrollmentId && (
                      <Link
                        href={`/student/programs/${item.enrollmentId}`}
                        className="type-supporting mt-2 inline-block font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        Go to the program
                      </Link>
                    )}
                  </div>
                  <StatusBadge status={status.status} className="self-start">
                    {status.label}
                  </StatusBadge>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav aria-label="Payment pages" className="mt-6 flex items-center justify-between gap-4">
              {page > 1 ? (
                <ButtonLink href={`/student/payments?page=${page - 1}`} variant="outline" size="sm">
                  Newer
                </ButtonLink>
              ) : (
                <span />
              )}
              <span className="type-supporting text-muted">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <ButtonLink href={`/student/payments?page=${page + 1}`} variant="outline" size="sm">
                  Older
                </ButtonLink>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}

export default function PaymentsPage({ searchParams }: PageProps<"/student/payments">) {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <Payments searchParams={searchParams} />
    </Suspense>
  );
}

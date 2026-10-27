import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/action-button";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { reconcilePaymentAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/auth/session";
import { PAYMENT_MODES, PAYMENT_STATUSES, type PaymentMode, type PaymentStatus } from "@/lib/constants";
import { formatDateTime } from "@/lib/learning/labels";
import { getPaymentAvailability } from "@/lib/payments/config";
import { attentionText, paymentStatusDisplay } from "@/lib/payments/labels";
import { listProgramsForAdmin } from "@/lib/services/admin-program-service";
import { listPaymentsForAdmin } from "@/lib/services/payment-service";
import { formatMinorUnits } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments · Admin", robots: { index: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Statuses that can still change if the provider has newer information. */
const CHECKABLE = new Set<PaymentStatus>(["created", "pending", "authorized", "failed", "cancelled"]);

async function Payments({ searchParams }: { searchParams: PageProps<"/admin/payments">["searchParams"] }) {
  const admin = await requireAdmin("/admin/payments");
  const actor = { id: admin.id, role: admin.role };
  const params = await searchParams;
  const rawStatus = first(params.status) ?? "";
  const status = rawStatus === "attention" || (PAYMENT_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : "";
  const rawMode = first(params.mode) ?? "";
  const mode = (PAYMENT_MODES as readonly string[]).includes(rawMode) ? rawMode : "";
  const programId = first(params.program) ?? "";
  const [list, programs] = await Promise.all([
    listPaymentsForAdmin(actor, {
      status: (status || undefined) as PaymentStatus | "attention" | undefined,
      mode: (mode || undefined) as PaymentMode | undefined,
      programId: programId || undefined,
      page: Number.parseInt(first(params.page) ?? "1", 10),
    }),
    listProgramsForAdmin(actor),
  ]);
  const availability = getPaymentAvailability();

  return (
    <>
      <AdminHeader
        title="Payments"
        description="Read-only record of online payments. Statuses change only from verified payment-provider data; they cannot be edited here."
      />
      <Notice
        tone={availability.available ? (availability.mode === "test" ? "warning" : "info") : "info"}
        title={
          availability.available
            ? availability.mode === "test"
              ? "Payments are in TEST mode"
              : "Payments are in LIVE mode"
            : "Online payments are switched off"
        }
        className="mb-6"
      >
        {availability.available
          ? "Refunds are not implemented in the platform. \"Check with provider\" fetches the real state from the payment provider and applies it; it never marks a payment as paid by itself."
          : "Set the payment variables to enable checkout (docs/payments.md)."}
      </Notice>

      <form method="get" className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <SelectField id="payment-status" name="status" label="Status" defaultValue={status}>
          <option value="">All statuses</option>
          <option value="attention">Needs attention</option>
          {PAYMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {paymentStatusDisplay[value].label} ({value})
            </option>
          ))}
        </SelectField>
        <SelectField id="payment-mode" name="mode" label="Mode" defaultValue={mode}>
          <option value="">Test and live</option>
          <option value="test">Test</option>
          <option value="live">Live</option>
        </SelectField>
        <SelectField id="payment-program" name="program" label="Program" defaultValue={programId}>
          <option value="">All programs</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.title}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
      </form>

      <p className="type-supporting mb-3 text-muted" aria-live="polite">
        {list.total} {list.total === 1 ? "payment" : "payments"}
      </p>
      {list.items.length === 0 ? (
        <EmptyState title="No payments found" description="Payments appear here when students start checkout." />
      ) : (
        <AdminTable caption="Payments" head={["Student", "Program", "Amount", "Status", "Provider references", "Dates", "Check"]}>
          {list.items.map((item) => {
            const display = paymentStatusDisplay[item.status];
            return (
              <tr key={item.id}>
                <Td>
                  <span className="font-semibold">{item.student.name}</span>
                  <span className="type-meta block wrap-anywhere text-muted">{item.student.email}</span>
                </Td>
                <Td>{item.program.title}</Td>
                <Td className="whitespace-nowrap">
                  {formatMinorUnits(item.amount, item.currency)}
                  <span className="type-meta block text-muted">{item.mode === "test" ? "Test" : "Live"}</span>
                </Td>
                <Td>
                  <StatusBadge status={display.status}>{display.label}</StatusBadge>
                  {item.failureCode && <span className="type-meta mt-1 block wrap-anywhere text-muted">Code: {item.failureCode}</span>}
                  {item.attentionReason && (
                    <span className="type-meta mt-1 block max-w-xs text-warning">{attentionText[item.attentionReason].admin}</span>
                  )}
                  {item.enrollmentId && <span className="type-meta mt-1 block text-muted">Enrollment linked</span>}
                </Td>
                <Td>
                  <span className="type-meta block font-mono wrap-anywhere">{item.providerOrderId ?? "No order"}</span>
                  {item.providerPaymentId && <span className="type-meta block font-mono wrap-anywhere">{item.providerPaymentId}</span>}
                  {item.verifiedVia && <span className="type-meta block text-muted">Verified via {item.verifiedVia}</span>}
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="type-meta block">Started {formatDateTime(item.createdAt)}</span>
                  {item.paidAt && <span className="type-meta block">Paid {formatDateTime(item.paidAt)}</span>}
                </Td>
                <Td>
                  {(CHECKABLE.has(item.status) && item.providerOrderId) || (item.status === "paid" && !item.enrollmentId && !item.attentionReason) ? (
                    <ActionButton action={reconcilePaymentAction.bind(null, item.id)} label="Check with provider" pendingLabel="Checking…" />
                  ) : (
                    <span className="type-meta text-muted">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </AdminTable>
      )}
      <Pagination
        label="Payment pages"
        page={list.page}
        totalPages={list.totalPages}
        hrefFor={(page) => withQuery("/admin/payments", { status, mode, program: programId, page })}
      />
      <p className="type-supporting mt-8 text-muted">
        Every reconciliation is recorded in the{" "}
        <Link href="/admin/audit-logs?entity=payment" className="font-semibold text-primary underline-offset-4 hover:underline">
          audit log
        </Link>
        .
      </p>
    </>
  );
}

export default function AdminPaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Payments searchParams={searchParams} />
    </Suspense>
  );
}

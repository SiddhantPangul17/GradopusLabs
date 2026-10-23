import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/action-button";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { processEmailOutboxAction, retryEmailJobAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/auth/session";
import { EMAIL_JOB_STATUSES, EMAIL_TYPES, type EmailJobStatus } from "@/lib/constants";
import { getEmailConfig } from "@/lib/email/config";
import { getServerEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/learning/labels";
import { listEmailJobs } from "@/lib/services/admin-notification-service";

export const metadata: Metadata = { title: "Notifications · Admin", robots: { index: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const STATUS: Record<EmailJobStatus, { label: string; status: Status }> = {
  pending: { label: "Pending", status: "pending" },
  processing: { label: "Processing", status: "pending" },
  sent: { label: "Accepted by provider", status: "success" },
  failed: { label: "Failed", status: "error" },
  cancelled: { label: "Cancelled", status: "neutral" },
};

const TYPE_LABEL: Record<string, string> = {
  welcome: "Welcome",
  password_reset: "Password reset",
  payment_confirmation: "Payment confirmation",
  enrollment_confirmation: "Enrolment confirmation",
  submission_reviewed: "Submission reviewed",
  certificate_issued: "Certificate issued",
  certificate_revoked: "Certificate revoked",
  certificate_replaced: "Certificate replaced",
};

async function Jobs({ searchParams }: { searchParams: PageProps<"/admin/notifications">["searchParams"] }) {
  const admin = await requireAdmin("/admin/notifications");
  const params = await searchParams;
  const status = first(params.status) ?? "";
  const type = first(params.type) ?? "";
  const list = await listEmailJobs({ id: admin.id, role: admin.role }, { status, type, page: Number.parseInt(first(params.page) ?? "1", 10) });
  const config = getEmailConfig();
  const schedulerConfigured = Boolean(getServerEnv().CRON_SECRET);

  return (
    <>
      <AdminHeader
        title="Email notifications"
        description="The email outbox. Messages are rendered from current records when sent; their content is not stored. “Accepted by provider” does not mean the email reached an inbox."
        actions={config.status === "ready" ? <ActionButton action={processEmailOutboxAction} label="Process queue now" pendingLabel="Processing…" /> : undefined}
      />
      {config.status !== "ready" && (
        <Notice tone="warning" title="Email delivery is not configured" className="mb-6">
          {config.reason} Emails stay queued (pending) and nothing is reported as sent. See docs/notifications.md.
        </Notice>
      )}
      {config.status === "ready" && !schedulerConfigured && (
        <Notice tone="warning" title="No scheduled processor" className="mb-6">
          CRON_SECRET is not set, so queued emails are only attempted right after requests or when you press “Process queue now”.
          Configure a scheduler for reliable delivery (docs/notifications.md).
        </Notice>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {EMAIL_JOB_STATUSES.map((value) => (
          <div key={value} className="rounded-card border border-border p-3">
            <dt className="type-meta text-muted">{STATUS[value].label}</dt>
            <dd className="text-xl font-bold text-foreground">{list.counts[value]}</dd>
          </div>
        ))}
      </dl>

      <form method="get" className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <SelectField id="job-status" name="status" label="Status" defaultValue={status}>
          <option value="">All statuses</option>
          {EMAIL_JOB_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS[value].label}
            </option>
          ))}
        </SelectField>
        <SelectField id="job-type" name="type" label="Email" defaultValue={type}>
          <option value="">All emails</option>
          {EMAIL_TYPES.map((value) => (
            <option key={value} value={value}>
              {TYPE_LABEL[value]}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
      </form>

      {list.items.length === 0 ? (
        <EmptyState title="No email jobs" description="Emails are queued when students register, pay, enrol, get reviews or certificates." />
      ) : (
        <AdminTable caption="Email jobs" head={["Email", "Recipient", "Status", "Attempts", "Times", "Retry"]}>
          {list.items.map((item) => (
            <tr key={item.id}>
              <Td>{TYPE_LABEL[item.type] ?? item.type}</Td>
              <Td>
                <span className="font-semibold">{item.recipient.name}</span>
                <span className="type-meta block wrap-anywhere text-muted">{item.recipient.email}</span>
              </Td>
              <Td>
                <StatusBadge status={STATUS[item.status].status}>{STATUS[item.status].label}</StatusBadge>
                {item.lastErrorCode && <span className="type-meta mt-1 block font-mono text-muted">{item.lastErrorCode}</span>}
              </Td>
              <Td>{item.attemptCount}</Td>
              <Td className="whitespace-nowrap">
                <span className="type-meta block">Queued {formatDateTime(item.createdAt)}</span>
                {item.sentAt && <span className="type-meta block">Accepted {formatDateTime(item.sentAt)}</span>}
                {item.status === "pending" && <span className="type-meta block">Next try {formatDateTime(item.nextAttemptAt)}</span>}
              </Td>
              <Td>
                {item.retryable ? (
                  <ActionButton action={retryEmailJobAction.bind(null, item.id)} label="Retry" ariaLabel={`Retry ${TYPE_LABEL[item.type]} email to ${item.recipient.name}`} pendingLabel="Queuing…" />
                ) : (
                  <span className="type-meta text-muted">—</span>
                )}
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}
      <Pagination label="Email job pages" page={list.page} totalPages={list.totalPages} hrefFor={(page) => withQuery("/admin/notifications", { status, type, page })} />
    </>
  );
}

export default function AdminNotificationsPage({ searchParams }: PageProps<"/admin/notifications">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Jobs searchParams={searchParams} />
    </Suspense>
  );
}

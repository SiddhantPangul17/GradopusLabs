import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField } from "@/components/ui/form-field";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { auditActionLabel } from "@/lib/admin/labels";
import { requireAdmin } from "@/lib/auth/session";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/constants";
import { formatDateTime } from "@/lib/learning/labels";
import { listAuditLogs } from "@/lib/services/admin-audit-service";

export const metadata: Metadata = { title: "Audit log · Admin", robots: { index: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function AuditLog({ searchParams }: { searchParams: PageProps<"/admin/audit-logs">["searchParams"] }) {
  const admin = await requireAdmin("/admin/audit-logs");
  const params = await searchParams;
  const action = first(params.action) ?? "";
  const entityType = first(params.entity) ?? "";
  const list = await listAuditLogs(
    { id: admin.id, role: admin.role },
    { action: action || undefined, entityType: entityType || undefined, page: Number.parseInt(first(params.page) ?? "1", 10) },
  );

  return (
    <>
      <AdminHeader title="Audit log" description="Append-only history of administrative and system actions. Entries cannot be edited or deleted." />
      <form method="get" className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <SelectField id="audit-action" name="action" label="Action" defaultValue={action}>
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((value) => (
            <option key={value} value={value}>
              {auditActionLabel(value)}
            </option>
          ))}
        </SelectField>
        <SelectField id="audit-entity" name="entity" label="Record type" defaultValue={entityType}>
          <option value="">All types</option>
          {AUDIT_ENTITY_TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
      </form>
      {list.items.length === 0 ? (
        <EmptyState title="No entries" description="Nothing has been recorded for these filters." />
      ) : (
        <AdminTable caption="Audit log entries" head={["When", "Action", "By", "Record", "Details"]}>
          {list.items.map((entry) => (
            <tr key={entry.id}>
              <Td className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</Td>
              <Td>{auditActionLabel(entry.action)}</Td>
              <Td className="wrap-anywhere">{entry.actor}</Td>
              <Td>
                {entry.entityType}
                <span className="type-meta block font-mono text-muted">{entry.entityId}</span>
              </Td>
              <Td className="max-w-md">
                {/* Metadata is sanitised when written (no secrets); shown as plain text. */}
                <code className="type-meta block whitespace-pre-wrap wrap-anywhere text-muted">{JSON.stringify(entry.metadata)}</code>
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}
      <Pagination label="Audit log pages" page={list.page} totalPages={list.totalPages} hrefFor={(page) => withQuery("/admin/audit-logs", { action, entity: entityType, page })} />
    </>
  );
}

export default function AuditLogPage({ searchParams }: PageProps<"/admin/audit-logs">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AuditLog searchParams={searchParams} />
    </Suspense>
  );
}

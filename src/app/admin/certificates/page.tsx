import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField, TextField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdmin } from "@/lib/auth/session";
import { getCertificateConfig } from "@/lib/certificates/config";
import { certificateStatusDisplay } from "@/lib/certificates/labels";
import { CERTIFICATE_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/learning/labels";
import { listProgramsForAdmin } from "@/lib/services/admin-program-service";
import { listCertificatesForAdmin } from "@/lib/services/certificate-service";

export const metadata: Metadata = { title: "Certificates · Admin", robots: { index: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function Certificates({ searchParams }: { searchParams: PageProps<"/admin/certificates">["searchParams"] }) {
  const admin = await requireAdmin("/admin/certificates");
  const actor = { id: admin.id, role: admin.role };
  const params = await searchParams;
  const q = first(params.q) ?? "";
  const status = first(params.status) ?? "";
  const programId = first(params.program) ?? "";
  const [list, programs] = await Promise.all([
    listCertificatesForAdmin(actor, { q, status, programId, page: Number.parseInt(first(params.page) ?? "1", 10) }),
    listProgramsForAdmin(actor),
  ]);
  const config = getCertificateConfig();

  return (
    <>
      <AdminHeader
        title="Certificates"
        description="Issued, revoked and replaced certificates. Records are never deleted and numbers are never reused."
        actions={<ButtonLink href="/admin/certificates/issue">Issue certificates</ButtonLink>}
      />
      {!config.ready && (
        <Notice tone="warning" title="Certificates cannot be issued yet" className="mb-6">
          {config.reason} Existing certificates can still be verified. See docs/certificates.md.
        </Notice>
      )}
      <form method="get" className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <TextField id="certificate-q" name="q" label="Certificate ID, student name or email" defaultValue={q} maxLength={100} />
        <SelectField id="certificate-status" name="status" label="Status" defaultValue={status}>
          <option value="">All statuses</option>
          {CERTIFICATE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {certificateStatusDisplay[value].label}
            </option>
          ))}
        </SelectField>
        <SelectField id="certificate-program" name="program" label="Program" defaultValue={programId}>
          <option value="">All programs</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.title}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <p className="type-supporting mb-3 text-muted" aria-live="polite">
        {list.total} {list.total === 1 ? "certificate" : "certificates"}
      </p>
      {list.items.length === 0 ? (
        <EmptyState title="No certificates found" description="Issued certificates appear here." />
      ) : (
        <AdminTable caption="Certificates" head={["Certificate", "Student (as printed)", "Program (as printed)", "Status", "Issued"]}>
          {list.items.map((item) => {
            const display = certificateStatusDisplay[item.status];
            return (
              <tr key={item.certificateId}>
                <Td>
                  <Link
                    href={`/admin/certificates/${encodeURIComponent(item.certificateId)}`}
                    className="font-mono font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {item.certificateId}
                  </Link>
                </Td>
                <Td>
                  <span className="font-semibold">{item.studentName}</span>
                  <span className="type-meta block wrap-anywhere text-muted">{item.student.email}</span>
                </Td>
                <Td>{item.programTitle}</Td>
                <Td>
                  <StatusBadge status={display.status}>{display.label}</StatusBadge>
                  {item.replacedBy && <span className="type-meta mt-1 block text-muted">Replaced by {item.replacedBy}</span>}
                </Td>
                <Td className="whitespace-nowrap">{formatDate(item.issuedAt)}</Td>
              </tr>
            );
          })}
        </AdminTable>
      )}
      <Pagination
        label="Certificate pages"
        page={list.page}
        totalPages={list.totalPages}
        hrefFor={(page) => withQuery("/admin/certificates", { q, status, program: programId, page })}
      />
    </>
  );
}

export default function AdminCertificatesPage({ searchParams }: PageProps<"/admin/certificates">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Certificates searchParams={searchParams} />
    </Suspense>
  );
}

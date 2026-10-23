import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IssueCertificateForm } from "@/components/admin/certificate-forms";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField, TextField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { issueCertificateAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/auth/session";
import { getCertificateConfig } from "@/lib/certificates/config";
import { listProgramsForAdmin } from "@/lib/services/admin-program-service";
import { listIssueCandidates } from "@/lib/services/certificate-service";

export const metadata: Metadata = { title: "Issue certificates · Admin", robots: { index: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function Issue({ searchParams }: { searchParams: PageProps<"/admin/certificates/issue">["searchParams"] }) {
  const admin = await requireAdmin("/admin/certificates/issue");
  const actor = { id: admin.id, role: admin.role };
  const params = await searchParams;
  const q = first(params.q) ?? "";
  const programId = first(params.program) ?? "";
  const completion = first(params.completion) === "all" ? "all" : "completed";
  const [list, programs] = await Promise.all([
    listIssueCandidates(actor, { q, programId, completion, page: Number.parseInt(first(params.page) ?? "1", 10) }),
    listProgramsForAdmin(actor),
  ]);
  const config = getCertificateConfig();

  return (
    <>
      <AdminHeader
        title="Issue certificates"
        breadcrumb={[{ label: "Certificates", href: "/admin/certificates" }]}
        description="Eligibility is calculated live from each student's records using the program's published requirements. It is checked again when you issue."
      />
      {!config.ready && (
        <Notice tone="warning" title="Certificates cannot be issued yet" className="mb-6">
          {config.reason}
        </Notice>
      )}
      <form method="get" className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <TextField id="issue-q" name="q" label="Student name or email" defaultValue={q} maxLength={100} />
        <SelectField id="issue-program" name="program" label="Program" defaultValue={programId}>
          <option value="">All programs</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.title}
            </option>
          ))}
        </SelectField>
        <SelectField id="issue-completion" name="completion" label="Completion" defaultValue={completion}>
          <option value="completed">Requirements completed</option>
          <option value="all">All active enrolments</option>
        </SelectField>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
      </form>

      <p className="type-supporting mb-3 text-muted" aria-live="polite">
        {list.total} {list.total === 1 ? "enrolment" : "enrolments"}
      </p>
      {list.items.length === 0 ? (
        <EmptyState title="No enrolments found" description="Try showing all active enrolments or another program." />
      ) : (
        <ul className="space-y-4">
          {list.items.map((item) => {
            const { eligibility } = item;
            return (
              <li key={item.enrollmentId} className="rounded-card border border-border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="type-label wrap-anywhere text-foreground">{item.student.name}</p>
                    <p className="type-meta wrap-anywhere text-muted">
                      {item.student.email} · {item.program.title} · enrolment {item.enrollmentStatus}
                      {eligibility.progress && ` · ${eligibility.progress.completedModules}/${eligibility.progress.totalModules} modules`}
                    </p>
                  </div>
                  {eligibility.existingCertificateId ? (
                    <StatusBadge status="success">Certificate issued</StatusBadge>
                  ) : (
                    <StatusBadge status={eligibility.eligible ? "success" : "neutral"}>{eligibility.eligible ? "Eligible" : "Not eligible"}</StatusBadge>
                  )}
                </div>
                {eligibility.existingCertificateId && (
                  <p className="type-supporting mt-2">
                    <Link
                      href={`/admin/certificates/${encodeURIComponent(eligibility.existingCertificateId)}`}
                      className="font-mono font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {eligibility.existingCertificateId}
                    </Link>
                  </p>
                )}
                {!eligibility.eligible && !eligibility.existingCertificateId && (
                  <ul className="type-supporting mt-2 list-disc space-y-1 pl-5 text-muted">
                    {eligibility.issues.map((issue) => (
                      <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
                    ))}
                  </ul>
                )}
                {eligibility.eligible && config.ready && (
                  <div className="mt-4 max-w-2xl">
                    <IssueCertificateForm
                      action={issueCertificateAction.bind(null, item.enrollmentId)}
                      idPrefix={`issue-${item.enrollmentId}`}
                      studentName={item.student.name}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        label="Enrolment pages"
        page={list.page}
        totalPages={list.totalPages}
        hrefFor={(page) => withQuery("/admin/certificates/issue", { q, program: programId, completion, page })}
      />
    </>
  );
}

export default function IssueCertificatesPage({ searchParams }: PageProps<"/admin/certificates/issue">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Issue searchParams={searchParams} />
    </Suspense>
  );
}

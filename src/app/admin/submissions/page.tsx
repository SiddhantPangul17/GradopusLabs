import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField } from "@/components/ui/form-field";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime, submissionStatusDisplay } from "@/lib/learning/labels";
import { listProgramsForAdmin } from "@/lib/services/admin-program-service";
import { listReviewQueue, REVIEW_FILTERS, type ReviewFilter } from "@/lib/services/admin-review-service";

export const metadata: Metadata = { title: "Submissions · Admin", robots: { index: false } };

const FILTER_LABELS: Record<ReviewFilter, string> = {
  pending: "Pending review",
  changes_requested: "Changes requested",
  accepted: "Accepted",
  rejected: "Rejected",
  all: "All",
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function Queue({ searchParams }: { searchParams: PageProps<"/admin/submissions">["searchParams"] }) {
  const admin = await requireAdmin("/admin/submissions");
  const actor = { id: admin.id, role: admin.role };
  const params = await searchParams;
  const rawFilter = first(params.status);
  const filter: ReviewFilter = rawFilter && rawFilter in REVIEW_FILTERS ? (rawFilter as ReviewFilter) : "pending";
  const programId = first(params.program) ?? "";
  const [queue, programs] = await Promise.all([
    listReviewQueue(actor, { filter, programId: programId || undefined, page: Number.parseInt(first(params.page) ?? "1", 10) }),
    listProgramsForAdmin(actor),
  ]);

  return (
    <>
      <AdminHeader title="Submissions" description="Pending work is listed oldest first. Open a submission to review it." />

      <form method="get" className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <SelectField id="filter-status" name="status" label="Status" defaultValue={filter}>
          {Object.entries(FILTER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField id="filter-program" name="program" label="Program" defaultValue={programId}>
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
        {queue.total} {queue.total === 1 ? "submission" : "submissions"}
      </p>
      {queue.items.length === 0 ? (
        <EmptyState title="Nothing here" description={filter === "pending" ? "There is no work waiting for review." : "No submissions match these filters."} />
      ) : (
        <AdminTable caption="Submissions" head={["Task", "Student", "Program / module", "Attempt", "Submitted", "Status"]}>
          {queue.items.map((item) => {
            const status = submissionStatusDisplay[item.status];
            return (
              <tr key={item.id}>
                <Td>
                  <Link href={`/admin/submissions/${item.id}`} className="font-semibold text-primary hover:underline">
                    {item.taskTitle}
                  </Link>
                </Td>
                <Td>{item.studentName}</Td>
                <Td>
                  {item.programTitle}
                  <span className="type-meta block text-muted">{item.moduleTitle}</span>
                </Td>
                <Td>{item.attempt}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(item.submittedAt)}</Td>
                <Td>
                  <StatusBadge status={status.status}>{status.label}</StatusBadge>
                </Td>
              </tr>
            );
          })}
        </AdminTable>
      )}
      <Pagination
        label="Submission pages"
        page={queue.page}
        totalPages={queue.totalPages}
        hrefFor={(page) => withQuery("/admin/submissions", { status: filter, program: programId, page })}
      />
    </>
  );
}

export default function AdminSubmissionsPage({ searchParams }: PageProps<"/admin/submissions">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Queue searchParams={searchParams} />
    </Suspense>
  );
}

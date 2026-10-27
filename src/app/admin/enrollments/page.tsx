import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { ManualEnrollmentForm } from "@/components/admin/people-forms";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField } from "@/components/ui/form-field";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { manualEnrollmentAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/auth/session";
import { ENROLLMENT_STATUSES } from "@/lib/constants";
import { enrollmentStatusDisplay, formatDate } from "@/lib/learning/labels";
import { listEnrollments } from "@/lib/services/admin-people-service";
import { listProgramsForAdmin } from "@/lib/services/admin-program-service";

export const metadata: Metadata = { title: "Enrollments · Admin", robots: { index: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const STATE_LABELS: Record<string, string> = {
  no_content: "No content yet",
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_review: "Awaiting review",
  requirements_completed: "Requirements completed",
};

async function Enrollments({ searchParams }: { searchParams: PageProps<"/admin/enrollments">["searchParams"] }) {
  const admin = await requireAdmin("/admin/enrollments");
  const actor = { id: admin.id, role: admin.role };
  const params = await searchParams;
  const status = first(params.status) ?? "";
  const programId = first(params.program) ?? "";
  const [list, programs] = await Promise.all([
    listEnrollments(actor, { status: status || undefined, programId: programId || undefined, page: Number.parseInt(first(params.page) ?? "1", 10) }),
    listProgramsForAdmin(actor),
  ]);

  return (
    <>
      <AdminHeader
        title="Enrollments"
        description="Enrollments from verified online payments and manual (unpaid) grants. Payment records are on the Payments page."
      />
      <form method="get" className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <SelectField id="enrollment-status" name="status" label="Status" defaultValue={status}>
          <option value="">All statuses</option>
          {ENROLLMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {enrollmentStatusDisplay[value].label}
            </option>
          ))}
        </SelectField>
        <SelectField id="enrollment-program" name="program" label="Program" defaultValue={programId}>
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
        {list.total} {list.total === 1 ? "enrollment" : "enrollments"}
      </p>
      {list.items.length === 0 ? (
        <EmptyState title="No enrollments found" description="Enrollments appear here when students are enrolled." />
      ) : (
        <AdminTable caption="Enrollments" head={["Student", "Program", "Status", "Source / payment", "Enrolled", "Progress"]}>
          {list.items.map((item) => {
            const display = enrollmentStatusDisplay[item.status];
            return (
              <tr key={item.id}>
                <Td>
                  <span className="font-semibold">{item.student.name}</span>
                  <span className="type-meta block wrap-anywhere text-muted">{item.student.email}</span>
                </Td>
                <Td>{item.program.title}</Td>
                <Td>
                  <StatusBadge status={display.status}>{display.label}</StatusBadge>
                </Td>
                <Td>{item.source === "manual" ? "Manual, no payment recorded" : "Online payment"}</Td>
                <Td className="whitespace-nowrap">{item.enrolledAt ? formatDate(item.enrolledAt) : "—"}</Td>
                <Td>{item.progress ? `${item.progress.percent}% · ${STATE_LABELS[item.progress.state] ?? item.progress.state}` : "Not started"}</Td>
              </tr>
            );
          })}
        </AdminTable>
      )}
      <Pagination
        label="Enrollment pages"
        page={list.page}
        totalPages={list.totalPages}
        hrefFor={(page) => withQuery("/admin/enrollments", { status, program: programId, page })}
      />

      <Card as="section" aria-labelledby="manual-heading" className="mt-10 max-w-3xl">
        <CardTitle as="h2" id="manual-heading">
          Grant a manual enrollment
        </CardTitle>
        <p className="type-supporting mt-2 text-muted">
          For legitimate cases handled outside online payment (for example scholarships or testing). It is recorded in the audit log as a
          manual enrollment with no payment. The student must already have an account.
        </p>
        <div className="mt-5">
          <ManualEnrollmentForm
            action={manualEnrollmentAction}
            programs={programs.filter((program) => program.status === "published").map((program) => ({ slug: program.slug, title: program.title }))}
          />
        </div>
      </Card>
    </>
  );
}

export default function AdminEnrollmentsPage({ searchParams }: PageProps<"/admin/enrollments">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Enrollments searchParams={searchParams} />
    </Suspense>
  );
}

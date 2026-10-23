import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StudentStatusForm } from "@/components/admin/people-forms";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/form-field";
import { ChevronDownIcon } from "@/components/ui/icons";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { setStudentStatusAction } from "@/lib/admin/actions";
import { accountStatusDisplay } from "@/lib/admin/labels";
import { requireAdmin } from "@/lib/auth/session";
import { formatDate } from "@/lib/learning/labels";
import { listStudents } from "@/lib/services/admin-people-service";

export const metadata: Metadata = { title: "Students · Admin", robots: { index: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function Students({ searchParams }: { searchParams: PageProps<"/admin/students">["searchParams"] }) {
  const admin = await requireAdmin("/admin/students");
  const params = await searchParams;
  const q = (first(params.q) ?? "").slice(0, 100);
  const list = await listStudents({ id: admin.id, role: admin.role }, { q, page: Number.parseInt(first(params.page) ?? "1", 10) });

  return (
    <>
      <AdminHeader title="Students" description="Student accounts, newest first. Administrators are managed with the admin command-line tool." />
      <form method="get" role="search" className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <TextField id="student-search" name="q" type="search" label="Search by name or email" defaultValue={q} maxLength={100} />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <p className="type-supporting mb-3 text-muted" aria-live="polite">
        {list.total} {list.total === 1 ? "student" : "students"}
        {q ? ` matching "${q}"` : ""}
      </p>
      {list.items.length === 0 ? (
        <EmptyState title="No students found" description={q ? "Try a different search." : "Students appear here after they register."} />
      ) : (
        <AdminTable caption="Students" head={["Student", "Joined", "Enrolments", "Status", "Account"]}>
          {list.items.map((student) => {
            const status = accountStatusDisplay[student.accountStatus];
            return (
              <tr key={student.id}>
                <Td>
                  <span className="font-semibold">{student.name}</span>
                  <span className="type-meta block wrap-anywhere text-muted">{student.email}</span>
                </Td>
                <Td className="whitespace-nowrap">{formatDate(student.createdAt)}</Td>
                <Td>{student.enrollments}</Td>
                <Td>
                  <StatusBadge status={status.status}>{status.label}</StatusBadge>
                </Td>
                <Td className="min-w-[16rem]">
                  {student.accountStatus === "deactivated" ? (
                    <span className="type-meta text-muted">Deactivated accounts cannot be changed here.</span>
                  ) : (
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-control type-button text-primary [&::-webkit-details-marker]:hidden">
                        {student.accountStatus === "active" ? "Suspend…" : "Reactivate…"}
                        <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-3">
                        <StudentStatusForm action={setStudentStatusAction.bind(null, student.id)} currentStatus={student.accountStatus} idPrefix={`student-${student.id}`} />
                      </div>
                    </details>
                  )}
                </Td>
              </tr>
            );
          })}
        </AdminTable>
      )}
      <Pagination label="Student pages" page={list.page} totalPages={list.totalPages} hrefFor={(page) => withQuery("/admin/students", { q, page })} />
    </>
  );
}

export default function AdminStudentsPage({ searchParams }: PageProps<"/admin/students">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Students searchParams={searchParams} />
    </Suspense>
  );
}

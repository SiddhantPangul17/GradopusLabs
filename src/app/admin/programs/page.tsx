import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { programStatusDisplay } from "@/lib/admin/labels";
import { requireAdmin } from "@/lib/auth/session";
import { PROGRAM_STATUSES, type ProgramStatus } from "@/lib/constants";
import { formatDateTime } from "@/lib/learning/labels";
import { listProgramsForAdmin } from "@/lib/services/admin-program-service";
import { formatMinorUnits } from "@/lib/utils";

export const metadata: Metadata = { title: "Programs · Admin", robots: { index: false } };

async function Programs({ searchParams }: { searchParams: PageProps<"/admin/programs">["searchParams"] }) {
  const admin = await requireAdmin("/admin/programs");
  const raw = (await searchParams).status;
  const status = typeof raw === "string" && (PROGRAM_STATUSES as readonly string[]).includes(raw) ? (raw as ProgramStatus) : undefined;
  const programs = await listProgramsForAdmin({ id: admin.id, role: admin.role }, { status });

  return (
    <>
      <AdminHeader
        title="Programs"
        description="Create programs, manage their learning content and control what appears in the public catalogue."
        actions={<ButtonLink href="/admin/programs/new">New program</ButtonLink>}
      />
      <nav aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
        {[{ value: undefined, label: "All" }, ...PROGRAM_STATUSES.map((value) => ({ value, label: programStatusDisplay[value].label }))].map((option) => (
          <Link
            key={option.label}
            href={option.value ? `/admin/programs?status=${option.value}` : "/admin/programs"}
            aria-current={status === option.value ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full border px-3.5 type-supporting font-medium ${status === option.value ? "border-primary bg-secondary text-secondary-foreground" : "border-border text-foreground hover:bg-surface"}`}
          >
            {option.label}
          </Link>
        ))}
      </nav>
      {programs.length === 0 ? (
        <EmptyState
          title={status ? "No programs with this status" : "No programs yet"}
          description="Programs you create start as drafts and are only shown publicly once published."
          action={<ButtonLink href="/admin/programs/new">Create a program</ButtonLink>}
        />
      ) : (
        <AdminTable caption="Programs" head={["Program", "Status", "Price", "Modules (published / total)", "Enrollments", "Updated"]}>
          {programs.map((program) => (
            <tr key={program.id}>
              <Td>
                <Link href={`/admin/programs/${program.id}`} className="font-semibold text-primary hover:underline">
                  {program.title}
                </Link>
                <span className="type-meta block text-muted">/{program.slug}</span>
              </Td>
              <Td>
                <StatusBadge status={programStatusDisplay[program.status].status}>{programStatusDisplay[program.status].label}</StatusBadge>
              </Td>
              <Td>{formatMinorUnits(program.price, program.currency)}</Td>
              <Td>
                {program.modules.published} / {program.modules.total}
              </Td>
              <Td>{program.enrollments}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(program.updatedAt)}</Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </>
  );
}

export default function AdminProgramsPage({ searchParams }: PageProps<"/admin/programs">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Programs searchParams={searchParams} />
    </Suspense>
  );
}

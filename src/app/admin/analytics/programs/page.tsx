import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { ReportFilters } from "@/components/analytics/report-filters";
import { BarList, Section } from "@/components/analytics/report-parts";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { programStatusDisplay } from "@/lib/admin/labels";
import { count, money, percent, resolveQuery } from "@/lib/analytics/page";
import { requireAdmin } from "@/lib/auth/session";
import type { ProgramStatus } from "@/lib/constants";
import { getProgramReport } from "@/lib/services/analytics-service";

export const metadata: Metadata = { title: "Program performance · Admin", robots: { index: false } };

async function Programs({ searchParams }: { searchParams: PageProps<"/admin/analytics/programs">["searchParams"] }) {
  const admin = await requireAdmin("/admin/analytics/programs");
  const { query, error } = resolveQuery(await searchParams);
  const { rows } = await getProgramReport({ id: admin.id, role: admin.role }, query);

  return (
    <>
      <AdminHeader
        title="Program performance"
        description="Enrollment figures cover enrollments CREATED in the selected period (a cohort), counted by their current status. Archived programs keep their history."
      />
      <ReportFilters action="/admin/analytics/programs" query={query} showMode exports={[{ report: "programs", label: "Program performance" }]} />
      {error && <Notice tone="warning" title={error} className="mb-6" />}
      {rows.length === 0 ? (
        <EmptyState title="No programs yet" description="Programs appear here once they are created." />
      ) : (
        <>
          <Section id="enrollments-heading" title="Enrollments by program" description="Enrollments created in the period, all sources (paid and manual).">
            <BarList
              caption="Enrollments created in the period, by program"
              rows={[...rows]
                .sort((a, b) => b.enrollments.total - a.enrollments.total)
                .slice(0, 15)
                .map((row) => ({ key: row.programId, label: row.title, value: row.enrollments.total, display: count(row.enrollments.total) }))}
            />
          </Section>

          <Section
            id="table-heading"
            title="All programs"
            description="Completion rate = enrollments that met every requirement ÷ enrollments currently active or completed (pending and cancelled are excluded). Paid = created by a verified payment. Collected = confirmed payments by payment date. Pending submissions are current."
          >
            <AdminTable
              caption="Program performance"
              head={["Program", "Enrollments", "Active / completed / cancelled", "Paid / manual", "Requirements met", "Completion rate", `Collected (${query.mode})`, "Certificates issued", "Pending reviews (now)"]}
            >
              {rows.map((row) => {
                const status = programStatusDisplay[row.status as ProgramStatus];
                return (
                  <tr key={row.programId}>
                    <Td>
                      <span className="font-semibold">{row.title}</span>
                      {status && (
                        <StatusBadge status={status.status} className="mt-1">
                          {status.label}
                        </StatusBadge>
                      )}
                    </Td>
                    <Td className="tabular-nums">{count(row.enrollments.total)}</Td>
                    <Td className="tabular-nums whitespace-nowrap">
                      {count(row.enrollments.active)} / {count(row.enrollments.completed)} / {count(row.enrollments.cancelled)}
                    </Td>
                    <Td className="tabular-nums whitespace-nowrap">
                      {count(row.enrollments.paid)} / {count(row.enrollments.manual)}
                    </Td>
                    <Td className="tabular-nums">{count(row.requirementsMet)}</Td>
                    <Td className="tabular-nums">{percent(row.completionRate)}</Td>
                    <Td className="tabular-nums whitespace-nowrap">
                      {row.collected.length ? row.collected.map((item) => <span key={item.currency} className="block">{money(item.amount, item.currency)} ({item.count})</span>) : "—"}
                    </Td>
                    <Td className="tabular-nums">{count(row.certificatesIssued)}</Td>
                    <Td className="tabular-nums">{count(row.pendingSubmissions)}</Td>
                  </tr>
                );
              })}
            </AdminTable>
            <p className="type-meta mt-3 text-muted">
              The program&apos;s current price, curriculum and completion rules are not necessarily those in force when older enrollments started.
              No ratings or satisfaction scores are collected.
            </p>
          </Section>
        </>
      )}
    </>
  );
}

export default function ProgramAnalyticsPage({ searchParams }: PageProps<"/admin/analytics/programs">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Programs searchParams={searchParams} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { ColumnChart } from "@/components/analytics/column-chart";
import { ReportFilters } from "@/components/analytics/report-filters";
import { Section, Stat, StatGrid, Unavailable } from "@/components/analytics/report-parts";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { count, money, resolveQuery, seriesSummary } from "@/lib/analytics/page";
import { periodSearch } from "@/lib/analytics/period";
import { requireAdmin } from "@/lib/auth/session";
import { getOverviewReport } from "@/lib/services/analytics-service";

export const metadata: Metadata = { title: "Analytics · Admin", robots: { index: false } };

async function Overview({ searchParams }: { searchParams: PageProps<"/admin/analytics">["searchParams"] }) {
  const admin = await requireAdmin("/admin/analytics");
  const { query, error } = resolveQuery(await searchParams);
  const report = await getOverviewReport({ id: admin.id, role: admin.role }, query);
  const { lifetime, period } = report;

  return (
    <>
      <AdminHeader title="Analytics" description="Figures calculated from the database when you open the page. Each figure says whether it is current or for the selected period." />
      <ReportFilters action="/admin/analytics" query={query} showMode />
      {error && <Notice tone="warning" title={error} className="mb-6" />}
      {report.empty ? (
        <EmptyState title="No data yet" description="Figures appear here once students register, programs are published and enrolments start." />
      ) : (
        <>
          <Section id="now-heading" title="Current totals">
            <StatGrid>
              <Stat label="Registered students" value={count(lifetime.students)} scope="lifetime" />
              <Stat label="Published programs" value={count(lifetime.publishedPrograms)} scope="now" />
              <Stat label="Active enrolments" value={count(lifetime.activeEnrollments)} scope="now" />
              <Stat label="Requirements met" value={count(lifetime.requirementsMet)} scope="now" note="current enrolments that met every requirement" />
              <Stat label="Submissions awaiting review" value={count(lifetime.pendingSubmissions)} scope="now" />
              <Stat label="Valid certificates" value={count(lifetime.validCertificates)} scope="now" />
              <Stat label="Revoked certificates" value={count(lifetime.revokedCertificates)} scope="now" />
              <Stat label="Enrolments marked completed" value={count(lifetime.completedEnrollments)} scope="now" note="status not yet set by the platform" />
            </StatGrid>
          </Section>

          <Section id="period-heading" title={`In this period: ${query.period.label}`}>
            <StatGrid>
              <Stat label="New students" value={count(period.newStudents)} scope="period" />
              <Stat label="New enrolments" value={count(period.newEnrollments)} scope="period" note="paid and manual" />
              <Stat
                label={`Collected (${query.mode} payments)`}
                value={period.collected.length ? period.collected.map((item) => money(item.amount, item.currency)).join(" + ") : money(0, "INR")}
                scope="period"
                note={`${count(period.collected.reduce((sum, item) => sum + item.count, 0))} confirmed payments`}
              />
              <Stat label="Net after refunds" value={<Unavailable>Not available</Unavailable>} scope="period" note="refunds are not tracked yet" />
              <Stat label="Submissions received" value={count(period.submissionsReceived)} scope="period" note="every attempt" />
              <Stat label="Submissions accepted" value={count(period.acceptedSubmissions)} scope="period" note="by decision date" />
              <Stat label="Certificates issued" value={count(period.certificatesIssued)} scope="period" />
              <Stat label="Certificates revoked" value={count(period.certificatesRevoked)} scope="period" />
            </StatGrid>
          </Section>

          <Section id="registrations-heading" title="New student registrations">
            <ColumnChart
              points={report.series.registrations}
              valueFormat={{ kind: "count" }}
              summary={seriesSummary(report.series.registrations, "new students", query.period.label, query.period.bucket)}
              tableCaption="New student registrations by period"
            />
          </Section>

          <Section id="revenue-heading" title={`Collected payments (${query.mode})`} description={<>Confirmed payments only, by payment date. <Link href={`/admin/analytics/revenue?${periodSearch(query)}`} className="font-semibold text-primary underline-offset-4 hover:underline">Revenue details</Link></>}>
            {report.series.revenue.length === 0 ? (
              <p className="type-supporting text-muted">No confirmed {query.mode} payments in this period.</p>
            ) : (
              report.series.revenue.map((series) => (
                <div key={series.currency} className="mb-6">
                  <h3 className="type-label mb-2 text-foreground">{series.currency}</h3>
                  <ColumnChart
                    points={series.points}
                    valueFormat={{ kind: "money", currency: series.currency }}
                    summary={seriesSummary(series.points, `${series.currency} collected`, query.period.label, query.period.bucket, (value) => money(value, series.currency))}
                    tableCaption={`Collected ${series.currency} by period`}
                  />
                </div>
              ))
            )}
          </Section>
        </>
      )}
    </>
  );
}

export default function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

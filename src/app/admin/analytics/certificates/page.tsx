import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { ColumnChart } from "@/components/analytics/column-chart";
import { ReportFilters } from "@/components/analytics/report-filters";
import { Section, Stat, StatGrid } from "@/components/analytics/report-parts";
import { Notice } from "@/components/ui/notice";
import { count, resolveQuery, seriesSummary } from "@/lib/analytics/page";
import { requireAdmin } from "@/lib/auth/session";
import { getCertificateReport } from "@/lib/services/analytics-service";

export const metadata: Metadata = { title: "Certificates report · Admin", robots: { index: false } };

async function Certificates({ searchParams }: { searchParams: PageProps<"/admin/analytics/certificates">["searchParams"] }) {
  const admin = await requireAdmin("/admin/analytics/certificates");
  const { query, error } = resolveQuery(await searchParams);
  const report = await getCertificateReport({ id: admin.id, role: admin.role }, query);

  return (
    <>
      <AdminHeader
        title="Certificates"
        description="From certificate records only (PDF downloads and regenerations are not issuances). Revoked and replaced certificates stay in the history; only “Valid” certificates are current."
      />
      <ReportFilters action="/admin/analytics/certificates" query={query} exports={[{ report: "certificates-by-program", label: "Certificates by program" }]} />
      {error && <Notice tone="warning" title={error} className="mb-6" />}

      <Section id="period-heading" title={`In this period: ${query.period.label}`}>
        <StatGrid>
          <Stat label="Issued" value={count(report.period.issued)} scope="period" note="includes corrected replacements" />
          <Stat label="Revoked" value={count(report.period.revoked)} scope="period" />
          <Stat label="Replaced by a correction" value={count(report.period.superseded)} scope="period" />
          <Stat label="Met requirements, no certificate yet" value={count(report.backlog)} scope="now" />
        </StatGrid>
      </Section>
      <Section id="lifetime-heading" title="All certificates">
        <StatGrid>
          <Stat label="Ever issued" value={count(report.lifetime.issuedEver)} scope="lifetime" />
          <Stat label="Valid now" value={count(report.lifetime.valid)} scope="now" />
          <Stat label="Revoked" value={count(report.lifetime.revoked)} scope="now" />
          <Stat label="Replaced" value={count(report.lifetime.superseded)} scope="now" />
        </StatGrid>
      </Section>
      <Section id="trend-heading" title="Certificates issued over time">
        <ColumnChart points={report.series} valueFormat={{ kind: "count" }} summary={seriesSummary(report.series, "certificates issued", query.period.label, query.period.bucket)} tableCaption="Certificates issued by period" />
      </Section>
      <Section id="programs-heading" title="By program">
        {report.byProgram.length === 0 ? (
          <p className="type-supporting text-muted">No certificates have been issued yet.</p>
        ) : (
          <AdminTable caption="Certificates by program" head={["Program", "Issued in period", "Valid now"]}>
            {report.byProgram.map((row) => (
              <tr key={row.programId}>
                <Td>{row.title}</Td>
                <Td className="tabular-nums">{count(row.issuedInPeriod)}</Td>
                <Td className="tabular-nums">{count(row.validNow)}</Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Section>
    </>
  );
}

export default function CertificateAnalyticsPage({ searchParams }: PageProps<"/admin/analytics/certificates">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Certificates searchParams={searchParams} />
    </Suspense>
  );
}

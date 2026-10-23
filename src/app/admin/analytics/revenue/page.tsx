import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { ColumnChart } from "@/components/analytics/column-chart";
import { ReportFilters } from "@/components/analytics/report-filters";
import { BarList, Section, Stat, StatGrid, Unavailable } from "@/components/analytics/report-parts";
import { Notice } from "@/components/ui/notice";
import { count, money, resolveQuery, seriesSummary } from "@/lib/analytics/page";
import { requireAdmin } from "@/lib/auth/session";
import type { PaymentStatus } from "@/lib/constants";
import { paymentStatusDisplay } from "@/lib/payments/labels";
import { getRevenueReport } from "@/lib/services/analytics-service";

export const metadata: Metadata = { title: "Revenue · Admin", robots: { index: false } };

const STARTED_ORDER: PaymentStatus[] = ["created", "pending", "authorized", "paid", "failed", "cancelled", "refund_pending", "partially_refunded", "refunded"];

async function Revenue({ searchParams }: { searchParams: PageProps<"/admin/analytics/revenue">["searchParams"] }) {
  const admin = await requireAdmin("/admin/analytics/revenue");
  const { query, error } = resolveQuery(await searchParams);
  const report = await getRevenueReport({ id: admin.id, role: admin.role }, query);

  return (
    <>
      <AdminHeader
        title="Revenue"
        description="Collected = payments confirmed by the payment provider, counted once each, by payment date. Orders that were only created, authorized, pending or failed are never counted. Currencies are never added together."
      />
      <ReportFilters
        action="/admin/analytics/revenue"
        query={query}
        showMode
        exports={[
          { report: "revenue-by-period", label: "Collected by period" },
          { report: "revenue-by-program", label: "Collected by program" },
        ]}
      />
      {error && <Notice tone="warning" title={error} className="mb-6" />}
      {query.mode === "test" && <Notice tone="warning" title="Test-mode payments: no real money" className="mb-6" />}

      <Section id="totals-heading" title="Collected">
        {report.collected.length === 0 ? (
          <p className="type-supporting text-muted">No confirmed {query.mode} payments in this period.</p>
        ) : (
          report.collected.map((item) => (
            <StatGrid key={item.currency} className="mb-3">
              <Stat label={`Gross collected (${item.currency})`} value={money(item.amount, item.currency)} scope="period" />
              <Stat label="Successful payments" value={count(item.count)} scope="period" />
              <Stat label="Average payment" value={money(item.average, item.currency)} scope="period" />
              <Stat label="Refunded / net" value={<Unavailable>Not available</Unavailable>} scope="period" note="refunds are not tracked yet" />
            </StatGrid>
          ))
        )}
        <p className="type-meta text-muted">{report.refunds.reason} Net collected therefore cannot be calculated; gross collected is shown instead.</p>
      </Section>

      {report.series.map((series) => (
        <Section key={series.currency} id={`series-${series.currency}`} title={`Collected over time (${series.currency})`}>
          <ColumnChart
            points={series.points}
            valueFormat={{ kind: "money", currency: series.currency }}
            summary={seriesSummary(series.points, `${series.currency} collected`, query.period.label, query.period.bucket, (value) => money(value, series.currency))}
            tableCaption={`Collected ${series.currency} by period`}
          />
        </Section>
      ))}

      <Section id="programs-heading" title="Collected by program">
        <BarList
          caption="Collected by program"
          rows={report.byProgram.slice(0, 20).map((row) => ({
            key: `${row.programId}-${row.currency}`,
            label: `${row.title}${row.status === "archived" ? " (archived)" : ""}`,
            value: row.amount,
            display: `${money(row.amount, row.currency)} · ${count(row.count)} payments`,
          }))}
        />
      </Section>

      <Section
        id="started-heading"
        title="Payments started in this period"
        description="Every checkout started in the period (by creation date), by its CURRENT status. Not revenue: only “Paid” (and refund states) mean money was collected."
      >
        <StatGrid>
          {STARTED_ORDER.filter((status) => report.started[status]).map((status) => (
            <Stat key={status} label={paymentStatusDisplay[status].label} value={count(report.started[status] ?? 0)} scope="period" note={status} />
          ))}
          <Stat label="Needing attention" value={count(report.needsAttention)} scope="now" note="paid without access, or mismatched" />
        </StatGrid>
        {Object.keys(report.started).length === 0 && <p className="type-supporting mt-3 text-muted">No payments were started in this period.</p>}
        <p className="type-supporting mt-3">
          <Link href={`/admin/payments?status=attention&mode=${query.mode}`} className="font-semibold text-primary underline-offset-4 hover:underline">
            Review payments needing attention
          </Link>
        </p>
      </Section>
    </>
  );
}

export default function RevenuePage({ searchParams }: PageProps<"/admin/analytics/revenue">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Revenue searchParams={searchParams} />
    </Suspense>
  );
}

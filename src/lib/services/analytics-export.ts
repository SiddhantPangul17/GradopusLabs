import "server-only";
import { Types } from "mongoose";
import { toCsv, type CsvValue } from "@/lib/analytics/csv";
import type { AnalyticsQuery } from "@/lib/analytics/period";
import { getCertificateReport, getLearningReport, getProgramReport, getRevenueReport } from "@/lib/services/analytics-service";
import { recordAuditEvent } from "@/lib/services/audit-log";
import { assertAdmin, type Actor } from "@/lib/services/authorization";

/*
 * CSV exports of the SAME aggregated reports shown on the analytics pages,
 * with the same filters and period boundaries. Aggregates only: no names,
 * emails, submission content, payment references, tokens or provider data.
 * Each export is limited to MAX_EXPORT_ROWS rows and audited (report type and
 * filters only; never the contents). Delivered as a direct download with
 * no-store caching; there is no stored or shareable file URL.
 */

export const EXPORT_REPORTS = ["programs", "revenue-by-period", "revenue-by-program", "learning-modules", "submissions-summary", "certificates-by-program"] as const;
export type ExportReport = (typeof EXPORT_REPORTS)[number];
export const MAX_EXPORT_ROWS = 5000;

const major = (amount: number) => (amount / 100).toFixed(2); // INR and other 2-decimal currencies
const percent = (value: number | null) => (value === null ? "" : (value * 100).toFixed(1));

async function build(actor: Actor, report: ExportReport, query: AnalyticsQuery): Promise<{ header: string[]; rows: CsvValue[][] }> {
  switch (report) {
    case "programs": {
      const { rows } = await getProgramReport(actor, query);
      return {
        header: [
          "program", "status", "enrolments_in_period", "active", "completed", "cancelled", "pending", "paid_enrolments", "manual_enrolments",
          "requirements_met", "completion_rate_percent", "certificates_issued_in_period", "pending_submissions_now", "currency", "collected_amount", "collected_payments",
        ],
        rows: rows.flatMap((row) => {
          const base: CsvValue[] = [
            row.title, row.status, row.enrollments.total, row.enrollments.active, row.enrollments.completed, row.enrollments.cancelled, row.enrollments.pending,
            row.enrollments.paid, row.enrollments.manual, row.requirementsMet, percent(row.completionRate), row.certificatesIssued, row.pendingSubmissions,
          ];
          return row.collected.length ? row.collected.map((money) => [...base, money.currency, major(money.amount), money.count]) : [[...base, "", "", 0]];
        }),
      };
    }
    case "revenue-by-period": {
      const revenue = await getRevenueReport(actor, query);
      return {
        header: ["bucket_start", "bucket", "mode", "currency", "collected_amount"],
        rows: revenue.series.flatMap((series) => series.points.map((point) => [point.key, query.period.bucket, query.mode, series.currency, major(point.value)])),
      };
    }
    case "revenue-by-program": {
      const revenue = await getRevenueReport(actor, query);
      return {
        header: ["program", "program_status", "mode", "currency", "collected_amount", "collected_payments"],
        rows: revenue.byProgram.map((row) => [row.title, row.status, query.mode, row.currency, major(row.amount), row.count]),
      };
    }
    case "learning-modules": {
      const learning = await getLearningReport(actor, query);
      return {
        header: ["program", "module", "current_enrolments", "completed_module", "completion_rate_percent"],
        rows: learning.modules.map((row) => [row.programTitle, row.moduleTitle, row.enrolled, row.completed, percent(row.enrolled ? row.completed / row.enrolled : null)]),
      };
    }
    case "submissions-summary": {
      const learning = await getLearningReport(actor, query);
      const rows: CsvValue[][] = [
        ["attempts_submitted_in_period", learning.submissions.attempts],
        ["unique_tasks_submitted_in_period", learning.submissions.uniqueTasks],
        ["resubmissions_in_period", learning.submissions.resubmissions],
        ...Object.entries(learning.submissions.byStatus).map(([status, n]): CsvValue[] => [`attempts_in_period_now_${status}`, n]),
        ...Object.entries(learning.reviews.decisions).map(([status, n]): CsvValue[] => [`decisions_in_period_${status}`, n ?? 0]),
        ["average_hours_to_decision", learning.reviews.averageHours],
        ["median_hours_to_decision", learning.reviews.medianHours],
        ["pending_reviews_now", learning.pendingNow.submissions],
        ["students_awaiting_review_now", learning.pendingNow.students],
        ["requirements_met_without_certificate_now", learning.certificateBacklog],
      ];
      return { header: ["metric", "value"], rows };
    }
    case "certificates-by-program": {
      const certificates = await getCertificateReport(actor, query);
      return {
        header: ["program", "issued_in_period", "valid_now"],
        rows: certificates.byProgram.map((row) => [row.title, row.issuedInPeriod, row.validNow]),
      };
    }
  }
}

export async function exportReport(actor: Actor, report: ExportReport, query: AnalyticsQuery): Promise<{ filename: string; csv: string; rows: number; truncated: boolean }> {
  assertAdmin(actor);
  const { header, rows } = await build(actor, report, query);
  const truncated = rows.length > MAX_EXPORT_ROWS;
  const kept = rows.slice(0, MAX_EXPORT_ROWS);
  const range = query.period.fromDate ? `${query.period.fromDate}-to-${query.period.toDate}` : `all-to-${query.period.toDate}`;
  const filename = `gradopus-labs-${report}-${query.mode}-${range}.csv`.replace(/[^a-z0-9.-]/gi, "-");
  await recordAuditEvent({
    actorId: actor.id,
    action: "analytics.exported",
    entityType: "report",
    entityId: new Types.ObjectId(),
    metadata: { report, period: query.period.preset, from: query.period.fromDate, to: query.period.toDate, mode: query.mode, rows: kept.length, truncated },
  });
  return { filename, csv: toCsv(header, kept), rows: kept.length, truncated };
}

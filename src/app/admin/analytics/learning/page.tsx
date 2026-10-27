import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { ColumnChart } from "@/components/analytics/column-chart";
import { ReportFilters } from "@/components/analytics/report-filters";
import { Section, Stat, StatGrid, Unavailable } from "@/components/analytics/report-parts";
import { Notice } from "@/components/ui/notice";
import { count, percent, resolveQuery, seriesSummary } from "@/lib/analytics/page";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/learning/labels";
import { getLearningReport } from "@/lib/services/analytics-service";

export const metadata: Metadata = { title: "Learning · Admin", robots: { index: false } };

const STATE_LABELS: Record<string, string> = {
  not_calculated: "Not started (no progress recorded)",
  no_content: "No content published yet",
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_review: "Waiting only on reviews",
  requirements_completed: "Requirements met",
};
const SUBMISSION_LABELS: Record<string, string> = {
  submitted: "Submitted (awaiting review)",
  under_review: "Under review",
  changes_requested: "Changes requested",
  accepted: "Accepted",
  rejected: "Not accepted",
};
const hours = (value: number | null) => (value === null ? <Unavailable>Not available</Unavailable> : value < 48 ? `${value} h` : `${Math.round(value / 24)} days`);

async function Learning({ searchParams }: { searchParams: PageProps<"/admin/analytics/learning">["searchParams"] }) {
  const admin = await requireAdmin("/admin/analytics/learning");
  const { query, error } = resolveQuery(await searchParams);
  const report = await getLearningReport({ id: admin.id, role: admin.role }, query);
  const { period } = query;

  return (
    <>
      <AdminHeader
        title="Learning and submissions"
        description="Progress uses the same rule as the student pages and certificate eligibility. No login or “time spent” activity is recorded, so engagement is not estimated."
      />
      <ReportFilters
        action="/admin/analytics/learning"
        query={query}
        exports={[
          { report: "submissions-summary", label: "Submission summary" },
          { report: "learning-modules", label: "Module completion" },
        ]}
      />
      {error && <Notice tone="warning" title={error} className="mb-6" />}

      <Section id="students-heading" title="Students and enrollments">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="type-label mb-2 text-foreground">New student registrations</h3>
            <ColumnChart points={report.registrations} valueFormat={{ kind: "count" }} summary={seriesSummary(report.registrations, "new students", period.label, period.bucket)} tableCaption="New student registrations by period" />
          </div>
          <div className="min-w-0">
            <h3 className="type-label mb-2 text-foreground">Enrollments started</h3>
            <ColumnChart points={report.enrollmentsStarted} valueFormat={{ kind: "count" }} summary={seriesSummary(report.enrollmentsStarted, "enrollments started", period.label, period.bucket)} tableCaption="Enrollments started by period" />
          </div>
        </div>
      </Section>

      <Section id="progress-heading" title="Where current enrollments stand" description="Enrollments that are active or completed, by their latest calculated progress.">
        <StatGrid>
          {Object.entries(STATE_LABELS)
            .filter(([state]) => report.progressStates[state])
            .map(([state, label]) => (
              <Stat key={state} label={label} value={count(report.progressStates[state] ?? 0)} scope="now" />
            ))}
          <Stat label="Met requirements, no certificate yet" value={count(report.certificateBacklog)} scope="now" note="eligibility is re-checked at issuance" />
        </StatGrid>
      </Section>

      <Section id="submissions-heading" title="Submissions" description="Every attempt counts once; resubmissions are attempts after the first for the same task and enrollment.">
        <StatGrid>
          <Stat label="Attempts submitted" value={count(report.submissions.attempts)} scope="period" />
          <Stat label="Distinct tasks submitted" value={count(report.submissions.uniqueTasks)} scope="period" note="enrollment + task" />
          <Stat label="Resubmissions" value={count(report.submissions.resubmissions)} scope="period" />
          <Stat label="Awaiting review" value={count(report.pendingNow.submissions)} scope="now" note={`${count(report.pendingNow.students)} students`} />
        </StatGrid>
        <div className="mt-6">
          <ColumnChart points={report.submissions.series} valueFormat={{ kind: "count" }} summary={seriesSummary(report.submissions.series, "attempts submitted", period.label, period.bucket)} tableCaption="Attempts submitted by period" />
        </div>
        <h3 className="type-label mt-6 text-foreground">Current status of attempts submitted in this period</h3>
        <StatGrid className="mt-3">
          {Object.entries(SUBMISSION_LABELS)
            .filter(([status]) => report.submissions.byStatus[status])
            .map(([status, label]) => (
              <Stat key={status} label={label} value={count(report.submissions.byStatus[status] ?? 0)} scope="period" />
            ))}
        </StatGrid>
      </Section>

      <Section id="reviews-heading" title="Reviews" description="Decisions recorded in the period. Review time = from submission to the recorded decision (accept, request changes or reject).">
        <StatGrid>
          <Stat label="Accepted" value={count(report.reviews.decisions.accepted ?? 0)} scope="period" />
          <Stat label="Changes requested" value={count(report.reviews.decisions.changes_requested ?? 0)} scope="period" />
          <Stat label="Not accepted" value={count(report.reviews.decisions.rejected ?? 0)} scope="period" />
          <Stat label="Average / median review time" value={<>{hours(report.reviews.averageHours)} / {hours(report.reviews.medianHours)}</>} scope="period" />
        </StatGrid>
        {report.pendingNow.oldestSubmittedAt && (
          <p className="type-supporting mt-3 text-muted">Oldest submission still waiting: {formatDateTime(report.pendingNow.oldestSubmittedAt)}.</p>
        )}
      </Section>

      <Section id="modules-heading" title="Module completion" description="Share of current enrollments in each program that have completed the module (published modules only).">
        {report.modules.length === 0 ? (
          <p className="type-supporting text-muted">No published modules yet.</p>
        ) : (
          <AdminTable caption="Module completion" head={["Program", "Module", "Completed", "Current enrollments", "Rate"]}>
            {report.modules.map((row) => (
              <tr key={row.moduleId}>
                <Td>{row.programTitle}</Td>
                <Td>{row.moduleTitle}</Td>
                <Td className="tabular-nums">{count(row.completed)}</Td>
                <Td className="tabular-nums">{count(row.enrolled)}</Td>
                <Td className="tabular-nums">{percent(row.enrolled ? row.completed / row.enrolled : null)}</Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Section>
    </>
  );
}

export default function LearningAnalyticsPage({ searchParams }: PageProps<"/admin/analytics/learning">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Learning searchParams={searchParams} />
    </Suspense>
  );
}

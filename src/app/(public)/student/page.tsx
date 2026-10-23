import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { EnrollmentCard } from "@/components/student/enrollment-card";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import { formatDateTime, submissionStatusDisplay } from "@/lib/learning/labels";
import { getStudentDashboard } from "@/lib/services/learning-service";

export const metadata: Metadata = {
  title: "Student dashboard",
  robots: { index: false },
};

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card as="li" elevated className="p-4 sm:p-5">
      <p className="type-supporting text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
      {hint && <p className="type-meta mt-1 text-muted">{hint}</p>}
    </Card>
  );
}

async function Dashboard() {
  const user = await requireStudent("/student");
  const { enrollments, stats, recentActivity } = await getStudentDashboard({ id: user.id, role: user.role });
  const learning = enrollments.filter((enrollment) => enrollment.access !== "none");

  return (
    <>
      <section aria-labelledby="welcome-heading" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="type-eyebrow text-primary">Student dashboard</p>
          <h1 id="welcome-heading" className="type-page-title mt-2 wrap-anywhere text-foreground">
            Welcome, {user.name}
          </h1>
          <p className="type-body mt-2 text-muted">
            Track your programs, pick up where you left off and follow the status of your submitted work.
          </p>
        </div>
        <ButtonLink href="/programs" variant="outline">
          Browse programs
        </ButtonLink>
      </section>

      <section aria-labelledby="overview-heading" className="mt-10">
        <h2 id="overview-heading" className="type-card-title text-foreground">
          Overview
        </h2>
        <ul data-reveal="stagger" className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Active programs" value={stats.activeEnrollments} />
          <Stat label="Completed programs" value={stats.completedPrograms} />
          <Stat label="Tasks to do" value={stats.pendingTasks} hint="Required tasks" />
          <Stat label="Awaiting review" value={stats.awaitingReview} />
          <Stat label="Reviewed submissions" value={stats.reviewedSubmissions} />
        </ul>
      </section>

      <section aria-labelledby="continue-heading" className="mt-12">
        <div className="flex items-end justify-between gap-4">
          <h2 id="continue-heading" className="type-section-title text-foreground">
            Continue learning
          </h2>
          {enrollments.length > 0 && (
            <Link href="/student/programs" className="rounded-control type-button text-primary hover:underline">
              All my programs
            </Link>
          )}
        </div>
        {learning.length === 0 ? (
          <EmptyState
            className="mt-6"
            title={enrollments.length === 0 ? "You are not enrolled in any programs yet" : "No programs are open for learning right now"}
            description={
              enrollments.length === 0
                ? "Online enrolment is not available yet. Once you are enrolled, your programs will appear here."
                : "See My programs for the status of your enrolments."
            }
            action={
              <ButtonLink href={enrollments.length === 0 ? "/programs" : "/student/programs"} variant="outline">
                {enrollments.length === 0 ? "Browse programs" : "View my programs"}
              </ButtonLink>
            }
          />
        ) : (
          <ul data-reveal="stagger" className="mt-6 grid gap-6 md:grid-cols-2">
            {learning.map((enrollment) => (
              <li key={enrollment.id}>
                <EnrollmentCard enrollment={enrollment} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {recentActivity.length > 0 && (
        <section aria-labelledby="activity-heading" className="mt-12">
          <h2 id="activity-heading" className="type-section-title text-foreground">
            Recent activity
          </h2>
          <ul data-reveal className="mt-6 divide-y divide-border overflow-hidden rounded-card border border-border bg-background shadow-card">
            {recentActivity.map((item) => {
              const status = submissionStatusDisplay[item.status];
              return (
                <li
                  key={`${item.taskId}-${item.attempt}`}
                  className="flex flex-col gap-2 p-4 transition-colors hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="type-label text-foreground">
                      {item.kind === "reviewed" ? "Reviewed: " : "Submitted: "}
                      <Link href={`/student/tasks/${item.taskId}#attempt-${item.attempt}`} className="text-primary underline-offset-4 hover:underline">
                        {item.taskTitle}
                      </Link>{" "}
                      <span className="font-normal text-muted">(attempt {item.attempt})</span>
                    </p>
                    <p className="type-meta mt-1 text-muted">
                      {item.programTitle} · <time dateTime={item.at}>{formatDateTime(item.at)}</time>
                    </p>
                  </div>
                  <StatusBadge status={status.status} className="self-start sm:self-center">
                    {status.label}
                  </StatusBadge>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

export default function StudentDashboardPage() {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <Dashboard />
    </Suspense>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ComponentType, type SVGProps } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { EnrollmentCard } from "@/components/student/enrollment-card";
import { ButtonArrow, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AwardIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  ClockIcon,
  ListChecksIcon,
  UploadIcon,
} from "@/components/ui/icons";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import { formatDateTime, submissionStatusDisplay } from "@/lib/learning/labels";
import { reveal, revealStagger } from "@/lib/reveal";
import { getStudentDashboard, type EnrollmentOverview } from "@/lib/services/learning-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Student dashboard",
  robots: { index: false },
};

type Tone = "primary" | "success" | "warning" | "info" | "secondary";

const toneStyles: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  secondary: "bg-secondary text-secondary-foreground",
};

const statusTone: Record<Status, string> = {
  success: toneStyles.success,
  pending: toneStyles.info,
  warning: toneStyles.warning,
  error: "bg-error/10 text-error",
  neutral: "bg-foreground/5 text-muted",
};

type StatProps = {
  label: string;
  value: number;
  hint?: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: Tone;
};

/** A summary number that also links to where the student can act on it. */
function Stat({ label, value, hint, href, icon: Icon, tone }: StatProps) {
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full flex-col rounded-card border border-border bg-background p-4 shadow-card transition-[border-color,box-shadow,translate] duration-300 ease-out-soft hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-hover sm:p-5"
      >
        <span className="flex items-start justify-between gap-2">
          <span aria-hidden="true" className={cn("flex size-10 items-center justify-center rounded-control", toneStyles[tone])}>
            <Icon className="size-5" />
          </span>
          <ChevronRightIcon aria-hidden="true" className="size-4 text-muted opacity-0 transition-[opacity,translate] group-hover:translate-x-0.5 group-hover:opacity-100" />
        </span>
        <span className="mt-4 text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</span>
        <span className="type-supporting mt-0.5 font-medium text-foreground">{label}</span>
        {hint && <span className="type-meta mt-0.5 text-muted">{hint}</span>}
      </Link>
    </li>
  );
}

/** The program the student is most likely to continue, shown in the welcome banner. */
function UpNext({ enrollment }: { enrollment: EnrollmentOverview }) {
  const progress = enrollment.progress;
  const percent = Math.min(100, Math.max(0, Math.round(progress?.percent ?? 0)));
  return (
    <div className="rounded-card bg-on-primary/10 p-5 ring-1 ring-on-primary/20 backdrop-blur-sm ring-inset">
      <p className="flex items-center gap-2 type-meta font-semibold tracking-wide text-on-primary/80 uppercase">
        <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
        Up next
      </p>
      <p className="mt-2 type-card-title wrap-anywhere text-on-primary">{enrollment.nextModule?.title ?? enrollment.program.title}</p>
      <p className="type-supporting mt-0.5 wrap-anywhere text-on-primary/75">{enrollment.program.title}</p>
      {progress && progress.totalModules > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between type-meta text-on-primary/80">
            <span>
              {progress.completedModules} of {progress.totalModules} modules
            </span>
            <span className="font-semibold text-on-primary">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`${enrollment.program.title} progress`}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-on-primary/20"
          >
            <div className="h-full origin-left animate-grow-x rounded-full bg-linear-to-r from-accent to-on-primary" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

async function Dashboard() {
  const user = await requireStudent("/student");
  const { enrollments, stats, recentActivity } = await getStudentDashboard({ id: user.id, role: user.role });
  const learning = enrollments.filter((enrollment) => enrollment.access !== "none");
  const current = learning.find((enrollment) => enrollment.access === "full" && enrollment.nextModule) ?? null;
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;

  return (
    <>
      <section
        aria-labelledby="welcome-heading"
        className="focus-ring-inverse relative isolate overflow-hidden rounded-card bg-linear-to-br from-primary via-primary to-primary-strong p-6 text-on-primary shadow-raised sm:p-10"
      >
        {/* Decorative glows. */}
        <div aria-hidden="true" className="absolute -top-28 -right-20 -z-10 size-80 rounded-full bg-accent/35 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-36 -left-24 -z-10 size-96 rounded-full bg-on-primary/15 blur-3xl" />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-25 [background-image:radial-gradient(rgb(255_255_255/0.5)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_left,#000,transparent_70%)]"
        />

        <div className={cn("grid items-center gap-8", current && "lg:grid-cols-[minmax(0,1fr)_22rem]")}>
          <div className="max-w-2xl">
            <p className="type-eyebrow text-on-primary/80">Student dashboard</p>
            <h1 id="welcome-heading" className="type-page-title mt-2 wrap-anywhere text-on-primary">
              Welcome back, {firstName}
            </h1>
            <p className="type-body mt-3 text-on-primary/80">
              Track your programs, pick up where you left off and follow the status of your submitted work.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {current?.nextModule && (
                <ButtonLink href={`/student/programs/${current.id}/modules/${current.nextModule.id}`} variant="secondary" size="lg">
                  Continue learning <ButtonArrow />
                </ButtonLink>
              )}
              <ButtonLink href="/programs" variant="ghost" size="lg" className="text-on-primary ring-1 ring-on-primary/35 ring-inset hover:bg-on-primary/10">
                Browse programs
              </ButtonLink>
            </div>
          </div>
          {current && <UpNext enrollment={current} />}
        </div>
      </section>

      <section aria-labelledby="overview-heading" className="mt-10">
        <h2 id="overview-heading" className="type-card-title text-foreground">
          At a glance
        </h2>
        {/* Two columns on phones: the fifth card spans the row so it is not left on its own. */}
        <ul {...revealStagger} className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5 [&>li:last-child]:col-span-2 lg:[&>li:last-child]:col-span-1">
          <Stat label="Active programs" value={stats.activeEnrollments} href="/student/programs" icon={BookOpenIcon} tone="primary" />
          <Stat label="Tasks to do" value={stats.pendingTasks} hint="Required tasks" href="/student/programs" icon={ListChecksIcon} tone="warning" />
          <Stat label="Awaiting review" value={stats.awaitingReview} href="/student/submissions" icon={ClockIcon} tone="info" />
          <Stat label="Reviewed" value={stats.reviewedSubmissions} hint="Submissions" href="/student/submissions" icon={ClipboardCheckIcon} tone="secondary" />
          <Stat label="Completed programs" value={stats.completedPrograms} href="/student/certificates" icon={AwardIcon} tone="success" />
        </ul>
      </section>

      <section aria-labelledby="continue-heading" className="mt-12">
        <div className="flex items-end justify-between gap-4">
          <h2 id="continue-heading" className="type-section-title text-foreground">
            Continue learning
          </h2>
          {enrollments.length > 0 && (
            <Link href="/student/programs" className="group inline-flex items-center gap-1 rounded-control type-button text-primary hover:underline">
              All my programs
              <ChevronRightIcon aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
        {learning.length === 0 ? (
          <EmptyState
            className="mt-6"
            title={enrollments.length === 0 ? "You are not enrolled in any programs yet" : "No programs are open for learning right now"}
            description={
              enrollments.length === 0
                ? "Browse the programs and enroll to start learning. Your programs will appear here."
                : "See My programs for the status of your enrollments."
            }
            action={
              <ButtonLink href={enrollments.length === 0 ? "/programs" : "/student/programs"}>
                {enrollments.length === 0 ? "Browse programs" : "View my programs"}
              </ButtonLink>
            }
          />
        ) : (
          <ul {...revealStagger} className={cn("mt-6 grid gap-6", learning.length > 1 && "md:grid-cols-2")}>
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
          <ul {...reveal} className="mt-6 divide-y divide-border overflow-hidden rounded-card border border-border bg-background shadow-card">
            {recentActivity.map((item) => {
              const status = submissionStatusDisplay[item.status];
              const Icon = item.kind === "reviewed" ? CheckCircleIcon : UploadIcon;
              return (
                <li key={`${item.taskId}-${item.attempt}`} className="group relative flex items-center gap-4 p-4 transition-colors hover:bg-secondary/40 sm:px-5">
                  <span
                    aria-hidden="true"
                    className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", item.kind === "reviewed" ? statusTone[status.status] : toneStyles.info)}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="type-label text-foreground">
                      {item.kind === "reviewed" ? "Reviewed: " : "Submitted: "}
                      <Link
                        href={`/student/tasks/${item.taskId}#attempt-${item.attempt}`}
                        className="text-primary underline-offset-4 after:absolute after:inset-0 after:content-[''] group-hover:underline"
                      >
                        {item.taskTitle}
                      </Link>{" "}
                      <span className="font-normal text-muted">(attempt {item.attempt})</span>
                    </p>
                    <p className="type-meta mt-1 text-muted">
                      {item.programTitle} · <time dateTime={item.at}>{formatDateTime(item.at)}</time>
                    </p>
                    {/* Phones: the status sits under the text; larger screens show it on the right. */}
                    <span className="mt-2 block sm:hidden">
                      <StatusBadge status={status.status}>{status.label}</StatusBadge>
                    </span>
                  </div>
                  <span className="hidden shrink-0 sm:block">
                    <StatusBadge status={status.status}>{status.label}</StatusBadge>
                  </span>
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

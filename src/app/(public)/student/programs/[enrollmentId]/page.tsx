import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { ProgressBar } from "@/components/student/progress-bar";
import { TaskRow } from "@/components/student/task-card";
import { ButtonArrow, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AwardIcon, BookOpenIcon, CheckIcon, ChevronRightIcon, ClockIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import { enrollmentStatusDisplay, formatMinutes, programStateDisplay } from "@/lib/learning/labels";
import { getEnrollmentLearning, type ModuleSummary } from "@/lib/services/learning-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Program",
  robots: { index: false },
};

const stateExplanation = {
  no_content: "Learning content for this program has not been published yet.",
  not_started: "Start with the first module below.",
  in_progress: "Keep going: complete every module to meet the program's requirements.",
  awaiting_review: "You have submitted everything required. Some work is waiting for review.",
  requirements_completed:
    "You have completed every required module and task. Certificates are issued by our team after a check of your records and appear under Certificates once issued.",
} as const;

type ModuleState = { label: string; status: Status; step: "done" | "review" | "todo" };

function moduleState(module: ModuleSummary): ModuleState {
  const { progress } = module;
  if (progress.complete) return { label: "Completed", status: "success", step: "done" };
  if (progress.awaitingReview > 0 && progress.requiredCompleted + progress.awaitingReview === progress.requiredTotal) {
    return { label: "Awaiting review", status: "pending", step: "review" };
  }
  if (progress.requiredCompleted > 0 || module.tasks.some((task) => task.state !== "not_started")) {
    return { label: "In progress", status: "pending", step: "todo" };
  }
  return { label: "Not started", status: "neutral", step: "todo" };
}

/** Numbered step marker on the module timeline. */
function StepMarker({ index, state, current }: { index: number; state: ModuleState; current: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative z-10 hidden size-10 shrink-0 sm:flex items-center justify-center rounded-full border-2 type-label font-semibold",
        state.step === "done" && "border-success bg-success text-on-primary",
        state.step === "review" && "border-info bg-background text-info",
        state.step === "todo" && (current ? "border-primary bg-primary text-on-primary" : "border-border bg-background text-muted"),
      )}
    >
      {state.step === "done" ? <CheckIcon className="size-5" /> : state.step === "review" ? <ClockIcon className="size-5" /> : index + 1}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-border bg-background/80 px-3 py-2.5 sm:px-4 sm:py-3">
      <dt className="type-meta text-muted">{label}</dt>
      <dd className="mt-0.5 type-card-title text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

async function ProgramLearning({ params }: { params: PageProps<"/student/programs/[enrollmentId]">["params"] }) {
  const { enrollmentId } = await params;
  const user = await requireStudent(`/student/programs/${encodeURIComponent(enrollmentId)}`);
  const result = await getEnrollmentLearning({ id: user.id, role: user.role }, enrollmentId);
  if (!result.ok) notFound();

  const { enrollment, modules } = result.data;
  const progress = enrollment.progress;
  const status = enrollmentStatusDisplay[enrollment.status];
  const moduleHref = (id: string) => `/student/programs/${enrollment.id}/modules/${id}`;

  const requiredTotal = modules.reduce((sum, module) => sum + module.progress.requiredTotal, 0);
  const requiredDone = modules.reduce((sum, module) => sum + module.progress.requiredCompleted, 0);
  const awaitingReview = modules.reduce((sum, module) => sum + module.progress.awaitingReview, 0);
  const nextModule = enrollment.nextModule;
  const finished = progress?.state === "requirements_completed";

  return (
    <>
      <nav aria-label="Breadcrumb" className="type-supporting text-muted">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <li>
            <Link href="/student/programs" className="rounded-control hover:text-foreground hover:underline">
              My programs
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-foreground">
            {enrollment.program.title}
          </li>
        </ol>
      </nav>

      <header className="relative mt-6 overflow-hidden rounded-card border border-border bg-linear-to-br from-secondary/70 via-background to-background p-6 shadow-card sm:p-8">
        <div aria-hidden="true" className="bg-dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative">
          <p className="type-eyebrow text-primary">{enrollment.program.category}</p>
          <h1 className="type-page-title mt-2 max-w-3xl wrap-anywhere text-foreground">{enrollment.program.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge status={status.status}>{status.label}</StatusBadge>
            {progress && <StatusBadge status={programStateDisplay[progress.state].status}>{programStateDisplay[progress.state].label}</StatusBadge>}
          </div>

          {enrollment.access !== "none" && progress && (
            <>
              {progress.totalModules > 0 && (
                <ProgressBar
                  className="mt-6 max-w-2xl"
                  percent={progress.percent}
                  label="Program progress"
                  valueText={`${progress.completedModules} of ${progress.totalModules} modules completed`}
                />
              )}
              <p className="type-supporting mt-3 max-w-2xl text-muted">{stateExplanation[progress.state]}</p>
              {enrollment.access === "read_only" && (
                <p className="type-supporting mt-2 max-w-2xl text-muted">
                  This program is completed. You can review the content and your submissions; new submissions are closed.
                </p>
              )}

              <dl className="mt-6 grid max-w-2xl grid-cols-3 gap-2 sm:gap-3">
                <Stat label="Modules" value={`${progress.completedModules} / ${progress.totalModules}`} />
                <Stat label="Tasks done" value={`${requiredDone} / ${requiredTotal}`} />
                <Stat label="In review" value={String(awaitingReview)} />
              </dl>

              <div className="mt-6 flex flex-wrap gap-3">
                {nextModule && !finished && (
                  <ButtonLink href={moduleHref(nextModule.id)} size="lg" multiline>
                    {progress.state === "not_started" ? "Start the first module" : `Continue: ${nextModule.title}`}
                    <ButtonArrow />
                  </ButtonLink>
                )}
                {finished && (
                  <ButtonLink href="/student/certificates" size="lg">
                    <AwardIcon className="size-5" /> View my certificates
                  </ButtonLink>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {enrollment.access === "none" ? (
        <Notice tone="info" title="Content not available" className="mt-8 max-w-3xl">
          {enrollment.program.status === "draft"
            ? "This program is temporarily unavailable while it is being updated."
            : enrollment.status === "pending"
              ? "Your enrollment is awaiting confirmation. The content opens once it is confirmed."
              : "This enrollment is no longer active, so the content is not available."}
        </Notice>
      ) : (
        <section aria-labelledby="modules-heading" className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="modules-heading" className="type-section-title text-foreground">
              Modules
            </h2>
            {modules.length > 0 && <p className="type-supporting text-muted">Open a module to read the lesson and do its tasks.</p>}
          </div>

          {modules.length === 0 ? (
            <EmptyState className="mt-6" title="No modules yet" description="Modules will appear here once they are published." />
          ) : (
            <ol className="relative mt-6 space-y-5">
              {/* Timeline rail behind the step markers. */}
              <span aria-hidden="true" className="absolute top-5 bottom-5 left-5 hidden sm:block w-0.5 -translate-x-1/2 bg-border" />
              {modules.map((module, index) => {
                const state = moduleState(module);
                const current = module.id === nextModule?.id && !finished;
                return (
                  <li key={module.id} className="relative flex sm:gap-5">
                    <StepMarker index={index} state={state} current={current} />

                    <article
                      aria-labelledby={`module-${module.id}-title`}
                      className={cn(
                        "min-w-0 flex-1 overflow-hidden rounded-card border bg-background shadow-card",
                        current ? "border-primary/40 ring-2 ring-primary/15" : "border-border",
                      )}
                    >
                      <Link
                        href={moduleHref(module.id)}
                        className="group flex flex-col items-start gap-3 p-5 sm:flex-row sm:gap-4 transition-colors hover:bg-secondary/40 focus-visible:-outline-offset-2 sm:p-6"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 type-meta text-muted">
                            <span>Module {index + 1}</span>
                            {module.estimatedDurationMinutes && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>about {formatMinutes(module.estimatedDurationMinutes)}</span>
                              </>
                            )}
                            {current && (
                              <span className="rounded-full bg-primary px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-on-primary uppercase">
                                Up next
                              </span>
                            )}
                          </span>
                          <span id={`module-${module.id}-title`} className="mt-1 block type-card-title wrap-anywhere text-foreground group-hover:text-primary">
                            {module.title}
                          </span>
                          {module.description && <span className="type-supporting mt-1 block line-clamp-2 text-muted">{module.description}</span>}
                          <span className="mt-3 inline-flex items-center gap-1 type-label font-semibold text-primary">
                            {state.step === "done" ? "Review module" : "Open module"}
                            <ChevronRightIcon aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </span>
                        <StatusBadge status={state.status} className="order-first shrink-0 sm:order-last">
                          {state.label}
                        </StatusBadge>
                      </Link>

                      {module.tasks.length > 0 ? (
                        <div className="border-t border-border bg-surface/60 px-2 py-2 sm:px-3">
                          <p className="px-3 pt-1 pb-1.5 type-meta font-semibold text-muted">
                            Tasks · {module.progress.requiredCompleted} of {module.progress.requiredTotal} required done
                          </p>
                          <ul className="space-y-0.5">
                            {module.tasks.map((task) => (
                              <li key={task.id}>
                                <TaskRow task={task} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="flex items-center gap-2 border-t border-border bg-surface/60 px-5 py-3 type-supporting text-muted sm:px-6">
                          <BookOpenIcon aria-hidden="true" className="size-4 shrink-0" />
                          Reading module: open it and mark it as complete when you have finished.
                        </p>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </>
  );
}

export default function ProgramLearningPage({ params }: PageProps<"/student/programs/[enrollmentId]">) {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <ProgramLearning params={params} />
    </Suspense>
  );
}

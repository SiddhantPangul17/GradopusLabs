import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { LearningMarkdown } from "@/components/student/markdown";
import { MarkReadButton } from "@/components/student/mark-read-button";
import { ProgressBar } from "@/components/student/progress-bar";
import { TaskCard } from "@/components/student/task-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon, CheckIcon, ClockIcon, ListChecksIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import { formatMinutes, taskStateDisplay } from "@/lib/learning/labels";
import { getModuleLearning } from "@/lib/services/learning-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Module",
  robots: { index: false },
};

type Params = PageProps<"/student/programs/[enrollmentId]/modules/[moduleId]">["params"];

/** Previous/next module link shown as a large, clearly clickable card. */
function ModuleStepLink({ href, direction, title }: { href: string; direction: "previous" | "next"; title: string }) {
  const isNext = direction === "next";
  return (
    <Link
      href={href}
      className={
        "group flex min-w-0 flex-1 items-center gap-3 rounded-card border border-border bg-background p-4 shadow-card transition-[border-color,box-shadow,translate] duration-300 ease-out-soft hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-hover sm:max-w-sm " +
        (isNext ? "sm:ml-auto sm:flex-row-reverse sm:text-right" : "")
      }
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-on-primary">
        {isNext ? <ArrowRightIcon className="size-5" /> : <ArrowLeftIcon className="size-5" />}
      </span>
      <span className="min-w-0">
        <span className="type-meta block text-muted">{isNext ? "Next module" : "Previous module"}</span>
        <span className="type-label block wrap-anywhere text-foreground group-hover:text-primary">{title}</span>
      </span>
    </Link>
  );
}

async function ModuleLearning({ params }: { params: Params }) {
  const { enrollmentId, moduleId } = await params;
  const user = await requireStudent(`/student/programs/${encodeURIComponent(enrollmentId)}/modules/${encodeURIComponent(moduleId)}`);
  const result = await getModuleLearning({ id: user.id, role: user.role }, enrollmentId, moduleId);

  if (!result.ok) {
    if (result.error === "forbidden") {
      return (
        <Notice tone="info" title="Content not available">
          {result.message}{" "}
          <Link href={`/student/programs/${encodeURIComponent(enrollmentId)}`} className="font-semibold underline">
            Back to the program
          </Link>
        </Notice>
      );
    }
    notFound();
  }

  const { enrollment, module, previous, next, canMarkRead } = result.data;
  const programHref = `/student/programs/${enrollment.id}`;
  const readOnly = enrollment.access === "read_only";
  const { progress } = module;

  const moduleIds = enrollment.progress?.modules.map((entry) => entry.id) ?? [];
  const position = moduleIds.indexOf(module.id);
  const requiredTasks = module.tasks.filter((task) => task.required);
  const optionalCount = module.tasks.length - requiredTasks.length;
  const percent = progress.requiredTotal > 0 ? (progress.requiredCompleted / progress.requiredTotal) * 100 : progress.complete ? 100 : 0;
  const moduleStatus = progress.complete
    ? { label: "Module completed", status: "success" as const }
    : progress.awaitingReview > 0
      ? { label: "Waiting for review", status: "pending" as const }
      : progress.requiredCompleted > 0 || module.tasks.some((task) => task.state !== "not_started")
        ? { label: "In progress", status: "pending" as const }
        : { label: "Not started", status: "neutral" as const };

  return (
    <article>
      <nav aria-label="Breadcrumb" className="type-supporting text-muted">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <li>
            <Link href="/student/programs" className="rounded-control hover:text-foreground hover:underline">
              My programs
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={programHref} className="rounded-control hover:text-foreground hover:underline">
              {enrollment.program.title}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-foreground">
            {module.title}
          </li>
        </ol>
      </nav>

      <header className="mt-6 max-w-3xl">
        {position >= 0 && (
          <p className="type-eyebrow text-primary">
            Module {position + 1} of {moduleIds.length}
          </p>
        )}
        <h1 className="type-page-title mt-2 wrap-anywhere text-foreground">{module.title}</h1>
        {module.description && <p className="type-lead mt-3 text-muted">{module.description}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusBadge status={moduleStatus.status}>{moduleStatus.label}</StatusBadge>
          {module.estimatedDurationMinutes && (
            <span className="inline-flex items-center gap-1.5 type-supporting text-muted">
              <ClockIcon aria-hidden="true" className="size-4" />
              About {formatMinutes(module.estimatedDurationMinutes)}
            </span>
          )}
          {module.tasks.length > 0 && (
            <span className="inline-flex items-center gap-1.5 type-supporting text-muted">
              <ListChecksIcon aria-hidden="true" className="size-4" />
              {module.tasks.length} {module.tasks.length === 1 ? "task" : "tasks"}
            </span>
          )}
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <div className="min-w-0 space-y-10">
          <Card as="section" aria-labelledby="lesson-heading" className="sm:p-8">
            <h2 id="lesson-heading" className="flex items-center gap-2 type-label text-muted">
              <BookOpenIcon aria-hidden="true" className="size-4" />
              Lesson
            </h2>
            <div className="mt-4">
              {module.content.trim() ? (
                <LearningMarkdown>{module.content}</LearningMarkdown>
              ) : (
                <p className="type-body text-muted">This module has no reading content.</p>
              )}
            </div>
          </Card>

          {module.tasks.length > 0 && (
            <section aria-labelledby="tasks-heading">
              <h2 id="tasks-heading" className="type-section-title text-foreground">
                Tasks
              </h2>
              <p className="type-supporting mt-2 text-muted">
                {requiredTasks.length > 0
                  ? `Complete the ${requiredTasks.length === 1 ? "required task" : `${requiredTasks.length} required tasks`} to finish this module.`
                  : "These tasks are optional."}
                {optionalCount > 0 && requiredTasks.length > 0 && ` ${optionalCount} optional ${optionalCount === 1 ? "task is" : "tasks are"} for extra practice.`}{" "}
                Select a task to open it.
              </p>
              <ul className="mt-5 space-y-4">
                {module.tasks.map((task) => (
                  <li key={task.id}>
                    <TaskCard task={task} readOnly={readOnly} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* First on phones, so progress is visible before the lesson; a sticky sidebar on desktop. */}
        <aside className="order-first lg:sticky lg:top-24 lg:order-0 lg:self-start">
          <Card as="section" aria-labelledby="module-progress-heading" elevated>
            <CardTitle as="h2" id="module-progress-heading">
              Your progress
            </CardTitle>
            {progress.readingOnly ? (
              <p className="type-supporting mt-2 text-muted">
                {progress.complete ? "You have marked this module as complete." : "Read the lesson, then mark this module as complete."}
              </p>
            ) : (
              <ProgressBar
                className="mt-4"
                percent={percent}
                label={`${module.title} progress`}
                valueText={`${progress.requiredCompleted} of ${progress.requiredTotal} required ${progress.requiredTotal === 1 ? "task" : "tasks"} done`}
              />
            )}
            {progress.awaitingReview > 0 && (
              <p className="type-meta mt-3 text-muted">
                {progress.awaitingReview} {progress.awaitingReview === 1 ? "submission is" : "submissions are"} waiting for review.
              </p>
            )}

            {requiredTasks.length > 0 && (
              <ul className="mt-5 space-y-2.5 border-t border-border pt-4" aria-label="Required tasks">
                {requiredTasks.map((task) => {
                  const done = task.state === "completed";
                  return (
                    <li key={task.id} className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                          done ? "border-success bg-success text-on-primary" : "border-border-strong/60 bg-background",
                        )}
                      >
                        {done && <CheckIcon className="size-3.5" />}
                      </span>
                      <Link
                        href={`/student/tasks/${task.id}`}
                        className={cn("type-supporting wrap-anywhere hover:text-primary hover:underline", done ? "text-muted line-through" : "text-foreground")}
                      >
                        {task.title}
                        <span className="sr-only">: {taskStateDisplay[task.state].label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {canMarkRead && (
              <div className="mt-5">
                <MarkReadButton enrollmentId={enrollment.id} moduleId={module.id} />
              </div>
            )}
          </Card>
        </aside>
      </div>

      <nav aria-label="Module navigation" className="mt-12 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
        {previous && <ModuleStepLink href={`${programHref}/modules/${previous.id}`} direction="previous" title={previous.title} />}
        {next ? (
          <ModuleStepLink href={`${programHref}/modules/${next.id}`} direction="next" title={next.title} />
        ) : (
          <ButtonLink href={programHref} className="sm:ml-auto sm:self-center">
            <ArrowLeftIcon className="size-4" /> Back to program overview
          </ButtonLink>
        )}
      </nav>
    </article>
  );
}

export default function ModulePage({ params }: PageProps<"/student/programs/[enrollmentId]/modules/[moduleId]">) {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <ModuleLearning params={params} />
    </Suspense>
  );
}

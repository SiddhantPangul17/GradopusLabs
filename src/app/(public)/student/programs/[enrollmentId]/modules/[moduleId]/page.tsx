import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { LearningMarkdown } from "@/components/student/markdown";
import { MarkReadButton } from "@/components/student/mark-read-button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRightIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import { formatDateTime, formatMinutes, taskStateDisplay, taskTypeLabel } from "@/lib/learning/labels";
import { getModuleLearning } from "@/lib/services/learning-service";

export const metadata: Metadata = {
  title: "Module",
  robots: { index: false },
};

type Params = PageProps<"/student/programs/[enrollmentId]/modules/[moduleId]">["params"];

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

  return (
    <article>
      <nav aria-label="Breadcrumb" className="type-supporting text-muted">
        <Link href="/student/programs" className="rounded-control hover:text-foreground hover:underline">
          My programs
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={programHref} className="rounded-control hover:text-foreground hover:underline">
          {enrollment.program.title}
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page" className="font-medium text-foreground">
          {module.title}
        </span>
      </nav>

      <header className="mt-4 max-w-3xl">
        <h1 className="type-page-title wrap-anywhere text-foreground">{module.title}</h1>
        {module.description && <p className="type-lead mt-3 text-muted">{module.description}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusBadge status={module.progress.complete ? "success" : "neutral"}>
            {module.progress.complete ? "Module completed" : "Not completed yet"}
          </StatusBadge>
          {module.estimatedDurationMinutes && (
            <span className="type-supporting text-muted">About {formatMinutes(module.estimatedDurationMinutes)}</span>
          )}
          {!module.progress.readingOnly && (
            <span className="type-supporting text-muted">
              {module.progress.requiredCompleted} of {module.progress.requiredTotal} required tasks completed
            </span>
          )}
        </div>
      </header>

      <div className="mt-8 max-w-3xl">
        {module.content.trim() ? (
          <LearningMarkdown>{module.content}</LearningMarkdown>
        ) : (
          <p className="type-body text-muted">This module has no reading content.</p>
        )}
      </div>

      {module.tasks.length > 0 && (
        <section aria-labelledby="tasks-heading" className="mt-10 max-w-3xl">
          <h2 id="tasks-heading" className="type-section-title text-foreground">
            Tasks
          </h2>
          <ul className="mt-4 space-y-3">
            {module.tasks.map((task) => (
              <li key={task.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="type-label text-foreground">
                        <Link href={`/student/tasks/${task.id}`} className="rounded-control underline-offset-4 hover:text-primary hover:underline">
                          {task.title}
                        </Link>
                      </h3>
                      <p className="type-meta mt-1 text-muted">
                        {taskTypeLabel[task.taskType]} · {task.required ? "Required" : "Optional"} ·{" "}
                        {task.completionRule === "review" ? "Reviewed by an instructor" : "Completes on submission"}
                        {task.dueDate ? <> · Due <time dateTime={task.dueDate}>{formatDateTime(task.dueDate)}</time></> : null}
                      </p>
                      {task.description && <p className="type-supporting mt-2 text-muted">{task.description}</p>}
                    </div>
                    <StatusBadge status={taskStateDisplay[task.state].status} className="self-start">
                      {taskStateDisplay[task.state].label}
                    </StatusBadge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canMarkRead && (
        <section aria-label="Module completion" className="mt-10 max-w-3xl">
          <MarkReadButton enrollmentId={enrollment.id} moduleId={module.id} />
        </section>
      )}

      <nav aria-label="Module navigation" className="mt-12 flex max-w-3xl flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between">
        {previous ? (
          <ButtonLink href={`${programHref}/modules/${previous.id}`} variant="outline" multiline>
            <span aria-hidden="true">←</span> Previous: {previous.title}
          </ButtonLink>
        ) : (
          <ButtonLink href={programHref} variant="outline">
            Back to program
          </ButtonLink>
        )}
        {next ? (
          <ButtonLink href={`${programHref}/modules/${next.id}`} multiline>
            Next: {next.title} <ArrowRightIcon className="size-4" />
          </ButtonLink>
        ) : (
          <ButtonLink href={programHref}>Back to program</ButtonLink>
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

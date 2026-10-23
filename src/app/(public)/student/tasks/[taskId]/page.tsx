import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { LearningMarkdown } from "@/components/student/markdown";
import { SubmissionForm } from "@/components/student/submission-form";
import { Card, CardTitle } from "@/components/ui/card";
import { FactList } from "@/components/ui/fact-list";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import { formatDateTime, submissionStatusDisplay, taskStateDisplay, taskTypeLabel } from "@/lib/learning/labels";
import { getTaskPage, type SubmissionView } from "@/lib/services/submission-service";

export const metadata: Metadata = {
  title: "Task",
  robots: { index: false },
};

function Attempt({ submission }: { submission: SubmissionView }) {
  const status = submissionStatusDisplay[submission.status];
  return (
    <li id={`attempt-${submission.attempt}`} className="scroll-mt-24">
      <Card as="article" aria-labelledby={`attempt-${submission.attempt}-heading`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 id={`attempt-${submission.attempt}-heading`} className="type-label text-foreground">
            Attempt {submission.attempt}
            <span className="font-normal text-muted">
              {" "}
              · submitted <time dateTime={submission.submittedAt}>{formatDateTime(submission.submittedAt)}</time>
            </span>
          </h3>
          <StatusBadge status={status.status} className="self-start sm:self-center">
            {status.label}
          </StatusBadge>
        </div>

        <div className="mt-4">
          {submission.submissionType === "project_url" && submission.projectUrl ? (
            <p className="type-supporting">
              <span className="text-muted">Project link: </span>
              {/* Untrusted link: validated https:// only, opened without referrer or window access. */}
              <a href={submission.projectUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="font-medium wrap-anywhere text-primary underline underline-offset-2">
                {submission.projectUrl}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          ) : (
            // Untrusted text: rendered as plain text (React escapes it), never as HTML or Markdown.
            <p className="type-supporting rounded-control bg-surface p-3 whitespace-pre-wrap wrap-anywhere text-foreground">
              {submission.textContent}
            </p>
          )}
        </div>

        {(submission.feedback || submission.score !== null) && (
          <div className="mt-4 rounded-control border-l-4 border-primary bg-secondary/40 p-3">
            <p className="type-label text-foreground">
              Reviewer feedback
              {submission.reviewedAt && (
                <span className="font-normal text-muted">
                  {" "}
                  · <time dateTime={submission.reviewedAt}>{formatDateTime(submission.reviewedAt)}</time>
                </span>
              )}
            </p>
            {submission.score !== null && <p className="type-supporting mt-1 text-foreground">Score: {submission.score} / 100</p>}
            {submission.feedback && <p className="type-supporting mt-1 whitespace-pre-wrap wrap-anywhere text-foreground">{submission.feedback}</p>}
          </div>
        )}
      </Card>
    </li>
  );
}

async function TaskDetails({ params }: { params: PageProps<"/student/tasks/[taskId]">["params"] }) {
  const { taskId } = await params;
  const user = await requireStudent(`/student/tasks/${encodeURIComponent(taskId)}`);
  const result = await getTaskPage({ id: user.id, role: user.role }, taskId);
  if (!result.ok) notFound();

  const { task, module, program, enrollment, state, attempts, submission } = result.data;
  const stateDisplay = taskStateDisplay[state];
  const programHref = `/student/programs/${enrollment.id}`;

  return (
    <article>
      <nav aria-label="Breadcrumb" className="type-supporting text-muted">
        <Link href={programHref} className="rounded-control hover:text-foreground hover:underline">
          {program.title}
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`${programHref}/modules/${module.id}`} className="rounded-control hover:text-foreground hover:underline">
          {module.title}
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page" className="font-medium text-foreground">
          {task.title}
        </span>
      </nav>

      <header className="mt-4 max-w-3xl">
        <h1 className="type-page-title wrap-anywhere text-foreground">{task.title}</h1>
        {task.description && <p className="type-lead mt-3 text-muted">{task.description}</p>}
        <StatusBadge status={stateDisplay.status} className="mt-4">
          {stateDisplay.label}
        </StatusBadge>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="instructions-heading">
            <h2 id="instructions-heading" className="type-section-title text-foreground">
              Instructions
            </h2>
            <div className="mt-4">
              {task.instructions.trim() ? (
                <LearningMarkdown>{task.instructions}</LearningMarkdown>
              ) : (
                <p className="type-body text-muted">No additional instructions.</p>
              )}
            </div>
          </section>

          <section aria-labelledby="submit-heading">
            <h2 id="submit-heading" className="type-section-title text-foreground">
              {attempts.length > 0 ? "Submit a new attempt" : "Submit your work"}
            </h2>
            <div className="mt-4">
              {task.taskType === "file" ? (
                <Notice tone="warning" title="File submissions are not available yet">
                  File uploads have not been set up on this platform, so this task cannot be submitted online yet. Nothing
                  you do here is saved.
                </Notice>
              ) : submission.allowed ? (
                <SubmissionForm taskId={task.id} submissionType={task.taskType} />
              ) : (
                <Notice tone="info" title="No new submission needed right now">
                  {submission.reason}
                </Notice>
              )}
            </div>
          </section>

          <section aria-labelledby="attempts-heading">
            <h2 id="attempts-heading" className="type-section-title text-foreground">
              Your attempts
            </h2>
            {attempts.length === 0 ? (
              <p className="type-body mt-4 text-muted">You have not submitted anything for this task yet.</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {attempts.map((attempt) => (
                  <Attempt key={attempt.id} submission={attempt} />
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card as="section" aria-labelledby="requirements-heading">
            <CardTitle as="h2" id="requirements-heading">
              Requirements
            </CardTitle>
            <FactList
              className="mt-4"
              items={[
                { label: "Submission type", value: taskTypeLabel[task.taskType] },
                { label: "Required", value: task.required ? "Yes" : "Optional" },
                { label: "Completion", value: task.completionRule === "review" ? "After instructor review" : "On submission" },
                ...(task.dueDate ? [{ label: "Due", value: formatDateTime(task.dueDate) }] : []),
                ...(task.taskType === "file" && task.allowedFileTypes.length > 0
                  ? [{ label: "File types", value: task.allowedFileTypes.join(", ") }]
                  : []),
              ]}
            />
            {task.dueDate && <p className="type-meta mt-3 text-muted">Late work can still be submitted; reviewers can see the submission date.</p>}
          </Card>
          {task.evaluationCriteria.length > 0 && (
            <Card as="section" aria-labelledby="criteria-heading">
              <CardTitle as="h2" id="criteria-heading">
                How it is evaluated
              </CardTitle>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 type-supporting text-foreground">
                {task.evaluationCriteria.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </article>
  );
}

export default function TaskPage({ params }: PageProps<"/student/tasks/[taskId]">) {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <TaskDetails params={params} />
    </Suspense>
  );
}

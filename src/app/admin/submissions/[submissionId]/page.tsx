import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { FeedbackForm, ReviewForm } from "@/components/admin/review-forms";
import { LearningMarkdown } from "@/components/student/markdown";
import { Card, CardTitle } from "@/components/ui/card";
import { FactList } from "@/components/ui/fact-list";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { reviewSubmissionAction, updateFeedbackAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime, submissionStatusDisplay, taskTypeLabel } from "@/lib/learning/labels";
import { getSubmissionForReview } from "@/lib/services/admin-review-service";
import type { SubmissionView } from "@/lib/services/submission-service";

export const metadata: Metadata = { title: "Review submission · Admin", robots: { index: false } };

function SubmittedWork({ submission }: { submission: SubmissionView }) {
  return submission.submissionType === "project_url" && submission.projectUrl ? (
    <p className="type-body">
      {/* Untrusted link: https only (validated), opened without referrer or window access. */}
      <a href={submission.projectUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="font-medium wrap-anywhere text-primary underline">
        {submission.projectUrl}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </p>
  ) : (
    // Untrusted text: shown as plain text only.
    <p className="type-body rounded-control bg-surface p-4 whitespace-pre-wrap wrap-anywhere">{submission.textContent}</p>
  );
}

async function Review({ params }: { params: PageProps<"/admin/submissions/[submissionId]">["params"] }) {
  const { submissionId } = await params;
  const admin = await requireAdmin(`/admin/submissions/${encodeURIComponent(submissionId)}`);
  const result = await getSubmissionForReview({ id: admin.id, role: admin.role }, submissionId);
  if (!result.ok) {
    if (result.error === "conflict") return <Notice tone="error" title="This submission cannot be reviewed">{result.message}</Notice>;
    notFound();
  }
  const { submission, student, program, module, task, history, isLatest, allowedDecisions } = result.data;
  const status = submissionStatusDisplay[submission.status];
  const decided = ["accepted", "changes_requested", "rejected"].includes(submission.status);

  return (
    <>
      <AdminHeader
        title={task.title}
        breadcrumb={[{ label: "Submissions", href: "/admin/submissions" }]}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={status.status}>{status.label}</StatusBadge>
            <span>
              Attempt {submission.attempt} · {program.title} · {module.title}
            </span>
          </span>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-8">
          <Card as="section" aria-labelledby="work-heading">
            <CardTitle as="h2" id="work-heading">
              Submitted work
            </CardTitle>
            <p className="type-meta mt-1 text-muted">Submitted {formatDateTime(submission.submittedAt)}</p>
            <div className="mt-4">
              <SubmittedWork submission={submission} />
            </div>
          </Card>

          <section aria-labelledby="instructions-heading">
            <h2 id="instructions-heading" className="type-section-title text-foreground">
              Task instructions
            </h2>
            <div className="mt-4">{task.instructions.trim() ? <LearningMarkdown>{task.instructions}</LearningMarkdown> : <p className="type-body text-muted">{task.description || "No instructions."}</p>}</div>
            {task.evaluationCriteria.length > 0 && (
              <>
                <h3 className="type-card-title mt-6 text-foreground">Evaluation criteria</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 type-body">
                  {task.evaluationCriteria.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="type-section-title text-foreground">
              All attempts for this task
            </h2>
            <ol className="mt-4 space-y-4">
              {history.map((attempt) => {
                const attemptStatus = submissionStatusDisplay[attempt.status];
                return (
                  <li key={attempt.id}>
                    <Card className={attempt.id === submission.id ? "border-primary" : undefined}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="type-label text-foreground">
                          Attempt {attempt.attempt}
                          {attempt.id === submission.id ? " (this submission)" : ""}
                          <span className="font-normal text-muted"> · {formatDateTime(attempt.submittedAt)}</span>
                        </p>
                        <StatusBadge status={attemptStatus.status}>{attemptStatus.label}</StatusBadge>
                      </div>
                      {attempt.id !== submission.id && (
                        <div className="mt-3">
                          <SubmittedWork submission={attempt} />
                        </div>
                      )}
                      {(attempt.feedback || attempt.score !== null) && (
                        <div className="mt-3 rounded-control border-l-4 border-primary bg-secondary/40 p-3 type-supporting">
                          {attempt.score !== null && <p>Score: {attempt.score} / 100</p>}
                          {attempt.feedback && <p className="whitespace-pre-wrap wrap-anywhere">{attempt.feedback}</p>}
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card as="section" aria-labelledby="student-heading">
            <CardTitle as="h2" id="student-heading">
              Student and task
            </CardTitle>
            <FactList
              className="mt-4"
              items={[
                { label: "Student", value: student.name },
                { label: "Email", value: student.email },
                { label: "Submission type", value: taskTypeLabel[task.taskType] },
                { label: "Required", value: task.required ? "Yes" : "Optional" },
                { label: "Completes", value: task.completionRule === "review" ? "When accepted" : "On submission" },
              ]}
            />
          </Card>

          <Card as="section" aria-labelledby="decision-heading">
            <CardTitle as="h2" id="decision-heading">
              {allowedDecisions.length > 0 ? "Review" : "Review recorded"}
            </CardTitle>
            <div className="mt-4">
              {!isLatest ? (
                <p className="type-supporting text-muted">The student has submitted a newer attempt. Review the latest attempt instead.</p>
              ) : allowedDecisions.length > 0 ? (
                <ReviewForm action={reviewSubmissionAction.bind(null, submission.id)} decisions={allowedDecisions} />
              ) : decided ? (
                <>
                  <p className="type-supporting mb-4 text-muted">
                    The decision is final. You can still correct the feedback or score; the change is recorded in the audit log. Accepting work
                    never issues a certificate by itself.
                  </p>
                  <FeedbackForm action={updateFeedbackAction.bind(null, submission.id)} feedback={submission.feedback ?? ""} score={submission.score} />
                </>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

export default function ReviewPage({ params }: PageProps<"/admin/submissions/[submissionId]">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Review params={params} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { ProgressBar } from "@/components/student/progress-bar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import {
  enrollmentStatusDisplay,
  formatMinutes,
  programStateDisplay,
  taskStateDisplay,
  taskTypeLabel,
} from "@/lib/learning/labels";
import { getEnrollmentLearning } from "@/lib/services/learning-service";

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

async function ProgramLearning({ params }: { params: PageProps<"/student/programs/[enrollmentId]">["params"] }) {
  const { enrollmentId } = await params;
  const user = await requireStudent(`/student/programs/${encodeURIComponent(enrollmentId)}`);
  const result = await getEnrollmentLearning({ id: user.id, role: user.role }, enrollmentId);
  if (!result.ok) notFound();

  const { enrollment, modules } = result.data;
  const progress = enrollment.progress;
  const status = enrollmentStatusDisplay[enrollment.status];

  return (
    <>
      <nav aria-label="Breadcrumb" className="type-supporting text-muted">
        <Link href="/student/programs" className="rounded-control hover:text-foreground hover:underline">
          My programs
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page" className="font-medium text-foreground">
          {enrollment.program.title}
        </span>
      </nav>

      <header className="mt-4 max-w-3xl">
        <p className="type-eyebrow text-primary">{enrollment.program.category}</p>
        <h1 className="type-page-title mt-2 wrap-anywhere text-foreground">{enrollment.program.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge status={status.status}>{status.label}</StatusBadge>
          {progress && <StatusBadge status={programStateDisplay[progress.state].status}>{programStateDisplay[progress.state].label}</StatusBadge>}
        </div>
      </header>

      {enrollment.access === "none" ? (
        <Notice tone="info" title="Content not available" className="mt-8 max-w-3xl">
          {enrollment.program.status === "draft"
            ? "This program is temporarily unavailable while it is being updated."
            : enrollment.status === "pending"
              ? "Your enrolment is awaiting confirmation. The content opens once it is confirmed."
              : "This enrolment is no longer active, so the content is not available."}
        </Notice>
      ) : (
        <>
          {progress && (
            <Card className="mt-8 max-w-3xl">
              {progress.totalModules > 0 && (
                <ProgressBar
                  percent={progress.percent}
                  label="Program progress"
                  valueText={`${progress.completedModules} of ${progress.totalModules} modules completed`}
                />
              )}
              <p className="type-supporting mt-4 text-muted">{stateExplanation[progress.state]}</p>
              {enrollment.access === "read_only" && (
                <p className="type-supporting mt-2 text-muted">This program is completed. You can review the content and your submissions; new submissions are closed.</p>
              )}
            </Card>
          )}

          <section aria-labelledby="modules-heading" className="mt-10">
            <h2 id="modules-heading" className="type-section-title text-foreground">
              Modules
            </h2>
            {modules.length === 0 ? (
              <EmptyState className="mt-6" title="No modules yet" description="Modules will appear here once they are published." />
            ) : (
              <ol className="mt-6 space-y-4">
                {modules.map((module, index) => {
                  const moduleState = module.progress.complete
                    ? { label: "Completed", status: "success" as const }
                    : module.progress.awaitingReview > 0 && module.progress.requiredCompleted + module.progress.awaitingReview === module.progress.requiredTotal
                      ? { label: "Awaiting review", status: "pending" as const }
                      : { label: "Not completed", status: "neutral" as const };
                  return (
                    <li key={module.id}>
                      <Card as="article">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="type-meta text-muted">
                              Module {index + 1}
                              {module.estimatedDurationMinutes ? ` · about ${formatMinutes(module.estimatedDurationMinutes)}` : ""}
                            </p>
                            <h3 className="type-card-title mt-1 text-foreground">
                              <Link
                                href={`/student/programs/${enrollment.id}/modules/${module.id}`}
                                className="rounded-control underline-offset-4 hover:text-primary hover:underline"
                              >
                                {module.title}
                              </Link>
                            </h3>
                            {module.description && <p className="type-supporting mt-1 text-muted">{module.description}</p>}
                          </div>
                          <StatusBadge status={moduleState.status} className="self-start">
                            {moduleState.label}
                          </StatusBadge>
                        </div>
                        {module.tasks.length > 0 ? (
                          <ul className="mt-4 space-y-2 border-t border-border pt-4">
                            {module.tasks.map((task) => (
                              <li key={task.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <Link href={`/student/tasks/${task.id}`} className="type-supporting rounded-control font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">
                                  {task.title}
                                  <span className="font-normal text-muted">
                                    {" "}
                                    · {taskTypeLabel[task.taskType]}
                                    {task.required ? "" : " · optional"}
                                  </span>
                                </Link>
                                <StatusBadge status={taskStateDisplay[task.state].status} className="self-start sm:self-center">
                                  {taskStateDisplay[task.state].label}
                                </StatusBadge>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="type-supporting mt-4 border-t border-border pt-4 text-muted">Reading module: mark it as complete when you have finished it.</p>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </>
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

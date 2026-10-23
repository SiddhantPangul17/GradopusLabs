import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import { formatDateTime, submissionStatusDisplay } from "@/lib/learning/labels";
import { listOwnSubmissions } from "@/lib/services/submission-service";

export const metadata: Metadata = {
  title: "My submissions",
  robots: { index: false },
};

async function Submissions({ searchParams }: { searchParams: PageProps<"/student/submissions">["searchParams"] }) {
  const user = await requireStudent("/student/submissions");
  const raw = (await searchParams).page;
  const requested = Number.parseInt(Array.isArray(raw) ? (raw[0] ?? "1") : (raw ?? "1"), 10);
  const { items, page, totalPages, total } = await listOwnSubmissions({ id: user.id, role: user.role }, requested);

  return (
    <>
      <SectionHeading as="h1" title="My submissions" description="Every attempt you have submitted, newest first." />

      {total === 0 ? (
        <EmptyState
          className="mt-8"
          title="No submissions yet"
          description="When you submit work for a task, it will appear here with its review status."
          action={
            <ButtonLink href="/student/programs" variant="outline">
              Go to my programs
            </ButtonLink>
          }
        />
      ) : (
        <>
          <p className="type-supporting mt-6 text-muted" aria-live="polite">
            {total} {total === 1 ? "submission" : "submissions"} · page {page} of {totalPages}
          </p>
          <ul className="mt-4 divide-y divide-border rounded-card border border-border">
            {items.map((item) => {
              const status = submissionStatusDisplay[item.status];
              return (
                <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="type-label wrap-anywhere text-foreground">
                      <Link href={`/student/tasks/${item.taskId}#attempt-${item.attempt}`} className="text-primary underline-offset-4 hover:underline">
                        {item.taskTitle}
                      </Link>{" "}
                      <span className="font-normal text-muted">(attempt {item.attempt})</span>
                    </p>
                    <p className="type-meta mt-1 text-muted">
                      {item.programTitle} · submitted <time dateTime={item.submittedAt}>{formatDateTime(item.submittedAt)}</time>
                      {item.hasFeedback ? " · feedback available" : ""}
                    </p>
                  </div>
                  <StatusBadge status={status.status} className="self-start sm:self-center">
                    {status.label}
                  </StatusBadge>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav aria-label="Submission pages" className="mt-6 flex items-center justify-between gap-4">
              {page > 1 ? (
                <ButtonLink href={`/student/submissions?page=${page - 1}`} variant="outline" size="sm">
                  Newer
                </ButtonLink>
              ) : (
                <span />
              )}
              <span className="type-supporting text-muted">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <ButtonLink href={`/student/submissions?page=${page + 1}`} variant="outline" size="sm">
                  Older
                </ButtonLink>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}

export default function SubmissionsPage({ searchParams }: PageProps<"/student/submissions">) {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <Submissions searchParams={searchParams} />
    </Suspense>
  );
}

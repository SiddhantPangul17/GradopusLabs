import { ButtonArrow, ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/student/progress-bar";
import { enrollmentStatusDisplay, programStateDisplay } from "@/lib/learning/labels";
import type { EnrollmentOverview } from "@/lib/services/learning-service";

/** Decorative program visual (no program images exist yet): initials on the brand colour. */
function ProgramVisual({ title }: { title: string }) {
  const initials = title
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  return (
    <div
      aria-hidden="true"
      className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-card bg-linear-to-br from-primary to-primary-strong text-xl font-bold text-on-primary shadow-button"
    >
      <span className="absolute -top-3 -right-3 size-8 rounded-full bg-accent/60 blur-md" />
      <span className="relative">{initials || "GL"}</span>
    </div>
  );
}

function accessMessage(enrollment: EnrollmentOverview): string | null {
  if (enrollment.access !== "none") return null;
  if (enrollment.program.status === "draft") return "This program is temporarily unavailable while it is being updated.";
  if (enrollment.status === "pending") return "Your enrollment is awaiting confirmation. The content opens once it is confirmed.";
  if (enrollment.status === "cancelled") return "This enrollment was cancelled, so the content is no longer available.";
  return "This program is not available.";
}

export function EnrollmentCard({ enrollment, headingLevel = "h3" }: { enrollment: EnrollmentOverview; headingLevel?: "h2" | "h3" }) {
  const status = enrollmentStatusDisplay[enrollment.status];
  const progress = enrollment.progress;
  const message = accessMessage(enrollment);
  const learnHref = `/student/programs/${enrollment.id}`;
  const continueHref = enrollment.nextModule ? `${learnHref}/modules/${enrollment.nextModule.id}` : learnHref;

  return (
    <Card as="article" elevated className="h-full">
      <div className="flex gap-4">
        <ProgramVisual title={enrollment.program.title} />
        <div className="min-w-0">
          <p className="type-eyebrow text-primary">{enrollment.program.category}</p>
          <CardTitle as={headingLevel} className="mt-1 wrap-anywhere">
            {enrollment.program.title}
          </CardTitle>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={status.status}>{status.label}</StatusBadge>
            {progress && <StatusBadge status={programStateDisplay[progress.state].status}>{programStateDisplay[progress.state].label}</StatusBadge>}
          </div>
        </div>
      </div>

      {progress && progress.totalModules > 0 && (
        <ProgressBar
          className="mt-5"
          percent={progress.percent}
          label={`${enrollment.program.title} progress`}
          valueText={`${progress.completedModules} of ${progress.totalModules} modules completed`}
        />
      )}
      {progress && progress.totalModules === 0 && (
        <p className="type-supporting mt-5 text-muted">Learning content for this program has not been published yet.</p>
      )}
      {message && <p className="type-supporting mt-5 text-muted">{message}</p>}

      {enrollment.access !== "none" && (
        <div className="mt-auto pt-5">
          {enrollment.nextModule && enrollment.access === "full" && (
            <p className="type-supporting mb-3 text-muted">
              Next: <span className="font-medium text-foreground">{enrollment.nextModule.title}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {enrollment.access === "full" && enrollment.nextModule ? (
              <ButtonLink href={continueHref}>
                Continue learning<span className="sr-only">: {enrollment.program.title}</span>
                <ButtonArrow />
              </ButtonLink>
            ) : null}
            <ButtonLink href={learnHref} variant="outline">
              View program<span className="sr-only">: {enrollment.program.title}</span>
            </ButtonLink>
          </div>
        </div>
      )}
    </Card>
  );
}

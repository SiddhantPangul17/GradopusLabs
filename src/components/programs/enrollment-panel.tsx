import { Button, ButtonArrow, ButtonLink } from "@/components/ui/button";
import { BookOpenIcon, CalendarIcon, CheckIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { availabilityDisplay, formatDuration, formatProgramPrice } from "@/lib/program-display";
import type { Program } from "@/types";

/**
 * Price, inclusions and the enrollment call to action.
 *
 * The button links to checkout only when enrollment is open AND online payment
 * is configured (`onlinePayment`); otherwise it stays disabled and says why.
 * The checkout page re-checks everything on the server (sign-in, program
 * status, price, existing enrollment), so this is only the entry point.
 */
export function EnrollmentPanel({ program, onlinePayment }: { program: Program; onlinePayment: boolean }) {
  const availability = availabilityDisplay[program.availability];
  const canEnroll = onlinePayment && program.availability === "open";
  const modules = program.modules.length;

  return (
    <section aria-labelledby="enroll-heading" className="overflow-hidden rounded-card border border-border bg-background shadow-raised">
      <div className="relative overflow-hidden bg-linear-to-br from-primary to-primary-strong px-6 py-6 text-on-primary">
        <span aria-hidden="true" className="absolute -top-10 -right-8 size-32 rounded-full bg-accent/30 blur-2xl" />
        <h2 id="enroll-heading" className="type-label relative text-on-primary/85">
          Enrollment fee
        </h2>
        <p className="relative mt-1 text-4xl font-bold tracking-tight tabular-nums">{formatProgramPrice(program)}</p>
        <p className="type-meta relative mt-3 flex flex-wrap gap-x-4 gap-y-1 text-on-primary/85">
          <span className="inline-flex items-center gap-1.5">
            <CalendarIcon className="size-3.5" />
            {formatDuration(program.durationWeeks)}
          </span>
          {modules > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <BookOpenIcon className="size-3.5" />
              {modules} {modules === 1 ? "module" : "modules"}
            </span>
          )}
        </p>
      </div>

      <div className="p-6">
        <StatusBadge status={availability.status}>{availability.label}</StatusBadge>

        {canEnroll ? (
          <>
            <ButtonLink href={`/checkout/${encodeURIComponent(program.slug)}`} size="lg" fullWidth className="mt-4" aria-describedby="enroll-note">
              Enroll in this program
              <ButtonArrow />
            </ButtonLink>
            <p id="enroll-note" className="type-supporting mt-3 text-muted">
              You will sign in and review the order before paying. Access starts once your payment is confirmed.
            </p>
          </>
        ) : (
          <>
            <Button size="lg" fullWidth disabled className="mt-4" aria-describedby="enroll-note">
              Enroll in this program
            </Button>
            <p id="enroll-note" className="type-supporting mt-3 text-muted">
              {program.availability !== "open"
                ? "Enrollment for this program is not open."
                : "Online enrollment and payment are not available yet. No payment can be made on this website at the moment."}
            </p>
          </>
        )}
        <ButtonLink href="/contact" variant="outline" fullWidth className="mt-4">
          Ask a question
        </ButtonLink>

        {program.inclusions.length > 0 && (
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="type-label text-foreground">What is included</h3>
            <ul className="mt-3 space-y-2.5">
              {program.inclusions.map((item) => (
                <li key={item} className="flex gap-2.5 type-supporting text-foreground">
                  <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-success/15">
                    <CheckIcon className="size-3 text-success" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

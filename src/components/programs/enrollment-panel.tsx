import { Button, ButtonArrow, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { availabilityDisplay, formatProgramPrice } from "@/lib/program-display";
import type { Program } from "@/types";

/**
 * Price, inclusions and the enrolment call to action.
 *
 * The button links to checkout only when enrolment is open AND online payment
 * is configured (`onlinePayment`); otherwise it stays disabled and says why.
 * The checkout page re-checks everything on the server (sign-in, program
 * status, price, existing enrolment), so this is only the entry point.
 */
export function EnrollmentPanel({ program, onlinePayment }: { program: Program; onlinePayment: boolean }) {
  const availability = availabilityDisplay[program.availability];
  const canEnrol = onlinePayment && program.availability === "open";

  return (
    <Card as="section" elevated aria-labelledby="enrol-heading">
      <h2 id="enrol-heading" className="type-label text-muted">
        Program fee
      </h2>
      <p className="mt-1 text-4xl font-bold tracking-tight text-foreground tabular-nums">{formatProgramPrice(program)}</p>
      <StatusBadge status={availability.status} className="mt-3 self-start">
        {availability.label}
      </StatusBadge>

      {canEnrol ? (
        <>
          <ButtonLink href={`/checkout/${encodeURIComponent(program.slug)}`} size="lg" fullWidth className="mt-5" aria-describedby="enrol-note">
            Enrol in this program
            <ButtonArrow />
          </ButtonLink>
          <p id="enrol-note" className="type-supporting mt-3 text-muted">
            You will sign in and review the order before paying. Access starts once your payment is confirmed.
          </p>
        </>
      ) : (
        <>
          <Button size="lg" fullWidth disabled className="mt-5" aria-describedby="enrol-note">
            Enrol in this program
          </Button>
          <p id="enrol-note" className="type-supporting mt-3 text-muted">
            {program.availability !== "open"
              ? "Enrolment for this program is not open."
              : "Online enrolment and payment are not available yet. No payment can be made on this website at the moment."}
          </p>
        </>
      )}
      <ButtonLink href="/contact" variant="outline" fullWidth className="mt-4">
        Ask a question
      </ButtonLink>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="type-label text-foreground">What is included</h3>
        <ul className="mt-3 space-y-2.5">
          {program.inclusions.map((item) => (
            <li key={item} className="flex gap-2.5 type-supporting text-foreground">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

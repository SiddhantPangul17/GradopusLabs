import { ProgramCard } from "@/components/programs/program-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { revealStagger } from "@/lib/reveal";
import type { Program } from "@/types";

type ProgramGridProps = {
  programs: readonly Program[];
  headingLevel?: "h2" | "h3";
};

/** Responsive grid of program cards, with a friendly empty state. */
export function ProgramGrid({ programs, headingLevel }: ProgramGridProps) {
  if (programs.length === 0) {
    return (
      <EmptyState
        title="No programs are available yet"
        description="New programs will be listed here as soon as they are ready. Have a question in the meantime? Get in touch."
        action={
          <ButtonLink href="/contact" variant="outline">
            Contact us
          </ButtonLink>
        }
      />
    );
  }

  return (
    <ul {...revealStagger} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {programs.map((program) => (
        <li key={program.slug}>
          <ProgramCard program={program} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}

import { ButtonArrow, ButtonLink } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardTitle } from "@/components/ui/card";
import { FactList } from "@/components/ui/fact-list";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  availabilityDisplay,
  formatDuration,
  formatProgramPrice,
  levelLabels,
  programHref,
} from "@/lib/program-display";
import type { Program } from "@/types";

type ProgramCardProps = {
  program: Program;
  /** Match the surrounding heading hierarchy (h2 on /programs, h3 inside a homepage section). */
  headingLevel?: "h2" | "h3";
};

export function ProgramCard({ program, headingLevel = "h3" }: ProgramCardProps) {
  const availability = availabilityDisplay[program.availability];

  return (
    <Card as="article" elevated interactive className="h-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-eyebrow text-primary">{program.category}</p>
        <StatusBadge status={availability.status}>{availability.label}</StatusBadge>
      </div>
      <CardTitle as={headingLevel} className="mt-3">
        {program.title}
      </CardTitle>
      <CardDescription className="mt-2">{program.summary}</CardDescription>
      <FactList
        className="mt-5 rounded-control border border-border/70 bg-surface p-3"
        items={[
          { label: "Level", value: levelLabels[program.level] },
          { label: "Duration", value: formatDuration(program.durationWeeks) },
          { label: "Price", value: formatProgramPrice(program) },
        ]}
      />
      <CardFooter>
        <ButtonLink href={programHref(program.slug)} variant="outline" fullWidth>
          View program<span className="sr-only">: {program.title}</span>
          <ButtonArrow />
        </ButtonLink>
      </CardFooter>
    </Card>
  );
}

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { buttonStyles } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import {
  ArrowRightIcon,
  AwardIcon,
  BookOpenIcon,
  ClockIcon,
  CodeIcon,
  LayersIcon,
  ShieldCheckIcon,
  SignalIcon,
} from "@/components/ui/icons";
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

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Categories are free text set by admins, so the banner icon is matched by keyword.
const categoryIcons: Array<{ pattern: RegExp; Icon: IconComponent }> = [
  { pattern: /dev|web|code|coding|software|program|app/i, Icon: CodeIcon },
  { pattern: /data|analytic|machine|\bai\b|ml/i, Icon: SignalIcon },
  { pattern: /secur|cyber|network/i, Icon: ShieldCheckIcon },
  { pattern: /design|ui|ux/i, Icon: LayersIcon },
];

function CategoryIcon({ category, ...props }: SVGProps<SVGSVGElement> & { category: string }) {
  const Icon = categoryIcons.find(({ pattern }) => pattern.test(category))?.Icon ?? BookOpenIcon;
  return <Icon {...props} />;
}

export function ProgramCard({ program, headingLevel = "h3" }: ProgramCardProps) {
  const availability = availabilityDisplay[program.availability];
  const facts: Array<{ label: string; value: string; Icon: IconComponent }> = [
    { label: "Level", value: levelLabels[program.level], Icon: SignalIcon },
    { label: "Duration", value: formatDuration(program.durationWeeks), Icon: ClockIcon },
  ];
  if (program.modules.length > 0) {
    const modules = program.modules.length;
    facts.push({ label: "Modules", value: `${modules} ${modules === 1 ? "module" : "modules"}`, Icon: BookOpenIcon });
  }

  return (
    // The title link stretches over the whole card, so any click on it opens the program.
    <article
      className={
        "group relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-background shadow-card " +
        "transition-[border-color,box-shadow,translate] duration-300 ease-out-soft " +
        "hover:-translate-y-1 hover:border-primary/30 hover:shadow-hover focus-within:border-primary/30 focus-within:shadow-hover"
      }
    >
      {/* Decorative brand banner */}
      <div className="relative h-28 overflow-hidden bg-linear-to-br from-primary to-primary-strong">
        <span
          aria-hidden="true"
          className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgb(255_255_255/0.55)_1px,transparent_1px)] [background-size:16px_16px]"
        />
        <span aria-hidden="true" className="absolute -top-10 -left-8 size-28 rounded-full bg-accent/35 blur-2xl" />
        <CategoryIcon category={program.category} className="absolute -right-5 -bottom-8 size-36 text-on-primary/10 transition-transform duration-500 ease-out-soft group-hover:scale-110 group-hover:-rotate-6" />
        <div className="relative flex h-full items-center gap-3 px-5 sm:px-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-control bg-on-primary/15 ring-1 ring-on-primary/25 backdrop-blur-sm">
            <CategoryIcon category={program.category} className="size-5 text-on-primary" />
          </span>
          <p className="type-eyebrow min-w-0 truncate text-on-primary">{program.category}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <StatusBadge status={availability.status} className="self-start">
          {availability.label}
        </StatusBadge>
        <CardTitle as={headingLevel} className="mt-3">
          <Link
            href={programHref(program.slug)}
            className="transition-colors after:absolute after:inset-0 after:rounded-card group-hover:text-primary"
          >
            {program.title}
          </Link>
        </CardTitle>
        <CardDescription className="mt-2 line-clamp-3">{program.summary}</CardDescription>

        <ul className="mt-5 flex flex-wrap gap-2">
          {facts.map(({ label, value, Icon }) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-3 py-1 type-meta font-semibold text-secondary-foreground"
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="sr-only">{label}: </span>
              {value}
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-6">
          <div className="flex items-end justify-between gap-3 border-t border-border pt-4">
            <div>
              <p className="type-meta flex items-center gap-1 text-muted">
                <AwardIcon className="size-3.5" />
                Enrollment fee
              </p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{formatProgramPrice(program)}</p>
            </div>
            {/* Visual only: the stretched title link above is the real, accessible link. */}
            <span aria-hidden="true" className={buttonStyles({ size: "sm", className: "group-hover:bg-primary-strong" })}>
              View program
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

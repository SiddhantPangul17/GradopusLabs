import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  title: string;
  /** Give the heading an id so a parent <section> can use aria-labelledby. */
  id?: string;
  eyebrow?: string;
  description?: ReactNode;
  /** h1 renders at page-title size; h2/h3 at section-title size. */
  as?: "h1" | "h2" | "h3";
  align?: "start" | "center";
  action?: { label: string; href: string };
  className?: string;
};

export function SectionHeading({
  title,
  id,
  eyebrow,
  description,
  as: Heading = "h2",
  align = "start",
  action,
  className,
}: SectionHeadingProps) {
  const centered = align === "center";

  return (
    <div
      data-reveal
      className={cn(
        "flex flex-col gap-4",
        centered ? "items-center text-center" : "sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow && <p className="type-eyebrow mb-2 text-primary">{eyebrow}</p>}
        <Heading id={id} className={cn(Heading === "h1" ? "type-page-title" : "type-section-title", "text-foreground")}>
          {title}
        </Heading>
        {description && <p className="type-lead mt-3 text-muted">{description}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-control type-button text-primary transition-colors hover:text-primary-strong"
        >
          {action.label}
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

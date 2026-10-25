import Link from "next/link";
import { PageSection } from "@/components/layout/page-container";
import { ButtonArrow, ButtonLink } from "@/components/ui/button";
import { reveal } from "@/lib/reveal";
import type { NavItem } from "@/types";

type CtaSectionProps = {
  /** Unique heading id for the section landmark. */
  id: string;
  title: string;
  description: string;
  primary: NavItem;
  secondary?: NavItem;
};

/** A closing call-to-action band: the one place a full brand-colour panel is used. */
export function CtaSection({ id, title, description, primary, secondary }: CtaSectionProps) {
  return (
    <PageSection labelledBy={id}>
      <div
        {...reveal}
        className="focus-ring-inverse relative isolate overflow-hidden rounded-card bg-primary px-6 py-12 text-center shadow-raised sm:px-12 sm:py-16"
      >
        {/* Soft highlights give the flat brand panel some depth; decorative only. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(255_255_255/0.16),transparent_70%)]"
        />
        <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-px bg-linear-to-r from-transparent via-on-primary/40 to-transparent" />
        <h2 id={id} className="type-section-title text-on-primary">
          {title}
        </h2>
        <p className="type-lead mx-auto mt-3 max-w-2xl text-on-primary/85">{description}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <ButtonLink href={primary.href} variant="secondary" size="lg" className="w-full sm:w-auto">
            {primary.label}
            <ButtonArrow />
          </ButtonLink>
          {secondary && (
            <Link
              href={secondary.href}
              className="rounded-control px-2 py-2 type-button text-on-primary underline decoration-on-primary/40 underline-offset-4 transition-[text-decoration-color] hover:decoration-on-primary"
            >
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </PageSection>
  );
}

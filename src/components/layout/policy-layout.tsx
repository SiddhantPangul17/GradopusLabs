import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { ChevronDownIcon } from "@/components/ui/icons";

export type PolicySection = {
  id: string;
  /** Section number as written in the policy ("3"), or null for unnumbered sections. */
  number: string | null;
  title: string;
  content: ReactNode;
};

type PolicyLayoutProps = {
  title: string;
  intro: ReactNode;
  sections: readonly PolicySection[];
};

function TableOfContents({ sections }: { sections: readonly PolicySection[] }) {
  return (
    <ol className="space-y-1">
      {sections.map((section) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="flex gap-2 rounded-control px-2 py-1 type-supporting text-muted transition-colors hover:bg-foreground/4 hover:text-foreground"
          >
            <span className="w-5 shrink-0 tabular-nums">{section.number && `${section.number}.`}</span>
            <span>{section.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Shared layout for policy documents: title, intro (version and effective
 * date), a table of contents (collapsible on mobile, sticky sidebar on
 * desktop) and numbered sections.
 */
export function PolicyLayout({ title, intro, sections }: PolicyLayoutProps) {
  return (
    <PageContainer className="py-12 sm:py-16">
      <header className="max-w-narrow">
        <p className="type-eyebrow text-primary">Policies</p>
        <h1 className="type-page-title mt-2 text-foreground">{title}</h1>
        <div className="mt-6">{intro}</div>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <details className="group rounded-card border border-border bg-surface lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 type-label text-foreground [&::-webkit-details-marker]:hidden">
            On this page
            <ChevronDownIcon className="size-5 text-muted transition-transform duration-300 ease-out-soft group-open:rotate-180" />
          </summary>
          <nav aria-label="On this page" className="px-4 pb-4">
            <TableOfContents sections={sections} />
          </nav>
        </details>

        <nav aria-label="On this page" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <p className="type-label mb-3 text-foreground">On this page</p>
          <TableOfContents sections={sections} />
        </nav>

        <div className="max-w-narrow space-y-10">
          {sections.map((section) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
              <h2 id={`${section.id}-heading`} className="text-xl font-semibold tracking-tight text-foreground">
                {section.number && `${section.number}. `}
                {section.title}
              </h2>
              <div className="mt-4">{section.content}</div>
            </section>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}

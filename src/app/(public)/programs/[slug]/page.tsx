import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { EnrollmentPanel } from "@/components/programs/enrollment-panel";
import { ProgramFixtureNotice } from "@/components/programs/program-fixture-notice";
import { FaqList } from "@/components/sections/faq-list";
import { FactList } from "@/components/ui/fact-list";
import { CheckIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { brand } from "@/config/brand";
import {
  availabilityDisplay,
  formatDuration,
  formatProgramPrice,
  levelLabels,
  programHref,
} from "@/lib/program-display";
import { getPaymentAvailability } from "@/lib/payments/config";
import { getProgramDataSource } from "@/lib/program-source";
import { getProgramBySlug, getProgramSlugs } from "@/lib/programs";
import { canonical } from "@/lib/seo";

// With Cache Components this must return at least one param. When there are
// no programs, a placeholder slug (which fails slug validation) keeps the
// build valid and resolves to the not-found page.
export async function generateStaticParams() {
  const slugs = await getProgramSlugs();
  return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [{ slug: "__no-programs__" }];
}

export async function generateMetadata({ params }: PageProps<"/programs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const program = await getProgramBySlug(slug);
  // Next.js adds noindex to 404 responses automatically.
  if (!program) return { title: "Program not found" };

  return {
    title: program.title,
    description: program.summary,
    openGraph: { title: `${program.title} | ${brand.name}`, description: program.summary, type: "website" },
    ...canonical(programHref(program.slug)),
  };
}

function DetailSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-10 first:border-t-0 first:pt-0">
      <h2 id={id} className="text-2xl font-bold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function CheckList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 type-body text-foreground">
          <CheckIcon className="mt-1 size-4 shrink-0 text-success" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function ProgramPage({ params }: PageProps<"/programs/[slug]">) {
  const { slug } = await params;
  const program = await getProgramBySlug(slug);
  if (!program) notFound();

  const availability = availabilityDisplay[program.availability];

  return (
    <PageContainer className="py-10 sm:py-14">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 type-supporting text-muted">
          <li>
            <Link href="/programs" className="rounded-control hover:text-foreground hover:underline">
              Programs
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-foreground">
            {program.title}
          </li>
        </ol>
      </nav>

      <header className="mt-6 max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <p className="type-eyebrow text-primary">{program.category}</p>
          <StatusBadge status={availability.status}>{availability.label}</StatusBadge>
        </div>
        <h1 className="type-page-title mt-3 text-foreground">{program.title}</h1>
        <p className="type-lead mt-4 text-muted">{program.summary}</p>
        <FactList
          className="mt-6 rounded-card border border-border bg-surface p-4"
          items={[
            { label: "Level", value: levelLabels[program.level] },
            { label: "Duration", value: formatDuration(program.durationWeeks) },
            { label: "Weekly effort", value: program.weeklyEffort },
            { label: "Price", value: formatProgramPrice(program) },
          ]}
        />
      </header>

      <ProgramFixtureNotice className="mt-6 max-w-3xl" />

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        {/* First in the DOM so the enrolment CTA appears early on mobile; a sticky sidebar on desktop. */}
        <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start">
          {/* Online checkout needs the database (not sample data) and a configured payment provider. */}
          <EnrollmentPanel
            program={program}
            onlinePayment={getProgramDataSource() === "database" && getPaymentAvailability().available}
          />
        </aside>

        <div className="space-y-10 lg:col-start-1 lg:row-start-1">
          <DetailSection id="overview" title="Overview">
            <div className="space-y-4 type-body text-foreground">
              {program.overview.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </DetailSection>

          <DetailSection id="audience" title="Who this program is for">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="type-card-title text-foreground">Intended audience</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 type-body text-foreground">
                  {program.audience.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="type-card-title text-foreground">Prerequisites</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 type-body text-foreground">
                  {program.prerequisites.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </DetailSection>

          <DetailSection id="outcomes" title="What you will learn">
            <CheckList items={program.outcomes} />
          </DetailSection>

          <DetailSection id="curriculum" title="Curriculum">
            <ol className="space-y-4">
              {program.modules.map((module, index) => (
                <li key={module.title} className="rounded-card border border-border p-5">
                  <p className="type-meta text-muted">Module {index + 1}</p>
                  <h3 className="type-card-title mt-1 text-foreground">{module.title}</h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {module.topics.map((topic) => (
                      <li key={topic} className="rounded-control bg-surface px-2.5 py-1 type-supporting text-foreground">
                        {topic}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </DetailSection>

          <DetailSection id="tasks" title="Tasks and project expectations">
            <p className="type-body text-foreground">
              Each module includes practical tasks. Every task lists the requirements your submission must meet, and
              each submission is reviewed against those requirements.
            </p>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {program.tasks.map((task) => (
                <li key={task.title} className="rounded-card border border-border p-5">
                  <h3 className="type-label text-foreground">{task.title}</h3>
                  <p className="type-supporting mt-1 text-muted">{task.description}</p>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-card border border-primary/30 bg-secondary/40 p-5">
              <h3 className="type-label text-secondary-foreground">Final project</h3>
              <p className="type-body mt-1 text-foreground">{program.finalProject}</p>
            </div>
          </DetailSection>

          <DetailSection id="format" title="Duration and delivery">
            <FactList
              items={[
                { label: "Duration", value: formatDuration(program.durationWeeks) },
                { label: "Weekly effort", value: program.weeklyEffort },
                { label: "Level", value: levelLabels[program.level] },
              ]}
            />
            <p className="type-body mt-5 text-foreground">{program.deliveryFormat}.</p>
          </DetailSection>

          <DetailSection id="completion" title="Completion and certificate eligibility">
            <p className="type-body text-foreground">To receive a certificate for this program, you must:</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 type-body text-foreground">
              {program.completionCriteria.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Notice tone="info" title="Enrolling does not by itself earn a certificate" className="mt-6">
              Certificates are issued only when all of the criteria above are met. Read the{" "}
              <Link href="/certificate-policy" className="font-semibold underline underline-offset-2">
                certificate policy
              </Link>{" "}
              for details.
            </Notice>
          </DetailSection>

          <DetailSection id="program-faq" title="Questions about this program">
            {program.faqs.length > 0 && <FaqList items={program.faqs} className="mb-5" />}
            <p className="type-body text-foreground">
              Find answers about tasks, certificates and payments in the{" "}
              <Link href="/faq" className="font-semibold text-primary underline underline-offset-4">
                FAQs
              </Link>
              , or{" "}
              <Link href="/contact" className="font-semibold text-primary underline underline-offset-4">
                contact us
              </Link>
              .
            </p>
          </DetailSection>
        </div>
      </div>
    </PageContainer>
  );
}

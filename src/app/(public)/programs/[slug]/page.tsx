import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { EnrollmentPanel } from "@/components/programs/enrollment-panel";
import { ProgramFixtureNotice } from "@/components/programs/program-fixture-notice";
import { FaqList } from "@/components/sections/faq-list";
import {
  AwardIcon,
  BookOpenIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  ClockIcon,
  CodeIcon,
  InfoIcon,
  ListChecksIcon,
  MonitorIcon,
  SignalIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { brand } from "@/config/brand";
import {
  availabilityDisplay,
  formatDuration,
  levelLabels,
  moduleDisplay,
  programHref,
} from "@/lib/program-display";
import { getPaymentAvailability } from "@/lib/payments/config";
import { getProgramDataSource } from "@/lib/program-source";
import { getProgramBySlug, getProgramSlugs } from "@/lib/programs";
import { canonical } from "@/lib/seo";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

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

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;
const twoDigits = (n: number) => String(n).padStart(2, "0");

/** A page section with an icon heading. `scroll-mt` keeps headings clear of the sticky header and section nav. */
function DetailSection({
  id,
  title,
  description,
  Icon,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  Icon: IconComponent;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-32">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-secondary text-primary">
          <Icon className="size-5" />
        </span>
        <h2 id={`${id}-heading`} className="type-section-title text-foreground">
          {title}
        </h2>
      </div>
      {description && <p className="type-body mt-3 text-muted">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function InfoCard({ title, Icon, items }: { title: string; Icon: IconComponent; items: readonly string[] }) {
  return (
    <div className="rounded-card border border-border bg-background p-5 shadow-card">
      <h3 className="flex items-center gap-2 type-card-title text-foreground">
        <Icon className="size-5 text-primary" />
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 type-supporting text-foreground">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ProgramPage({ params }: PageProps<"/programs/[slug]">) {
  const { slug } = await params;
  const program = await getProgramBySlug(slug);
  if (!program) notFound();

  const availability = availabilityDisplay[program.availability];
  const hasAudience = program.audience.length > 0 || program.prerequisites.length > 0;
  const hasProjects = program.tasks.length > 0 || program.finalProject.trim() !== "";

  const stats: Array<{ label: string; value: string; Icon: IconComponent }> = [
    { label: "Level", value: levelLabels[program.level], Icon: SignalIcon },
    { label: "Duration", value: formatDuration(program.durationWeeks), Icon: CalendarIcon },
    { label: "Weekly effort", value: program.weeklyEffort, Icon: ClockIcon },
    { label: "Format", value: program.deliveryFormat, Icon: MonitorIcon },
  ];

  const sections = [
    { id: "overview", label: "Overview", show: true },
    { id: "outcomes", label: "What you'll learn", show: program.outcomes.length > 0 },
    { id: "curriculum", label: "Curriculum", show: program.modules.length > 0 },
    { id: "projects", label: "Projects", show: hasProjects },
    { id: "certificate", label: "Certificate", show: true },
    { id: "program-faq", label: "FAQs", show: true },
  ].filter((section) => section.show);

  return (
    <>
      {/* Hero */}
      <section
        aria-labelledby="program-title"
        className="relative isolate overflow-hidden border-b border-border bg-linear-to-b from-secondary/50 to-background"
      >
        <div aria-hidden="true" className="bg-dot-grid absolute inset-0 -z-10" />
        <PageContainer className="py-10 sm:py-14">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 type-supporting text-muted">
              <li>
                <Link href="/programs" className="rounded-control hover:text-foreground hover:underline">
                  Programs
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRightIcon className="size-4" />
              </li>
              <li aria-current="page" className="font-medium text-foreground">
                {program.title}
              </li>
            </ol>
          </nav>

          <div className="mt-6 max-w-3xl animate-fade-up">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 type-eyebrow text-on-primary">
                {program.category}
              </span>
              <StatusBadge status={availability.status}>{availability.label}</StatusBadge>
            </div>
            <h1 id="program-title" className="type-display mt-4 text-foreground">
              {program.title}
            </h1>
            <p className="type-lead mt-4 text-muted">{program.summary}</p>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-3 animate-fade-up stagger-1 lg:grid-cols-4">
            {stats.map(({ label, value, Icon }) => (
              <div key={label} className="flex items-start gap-3 rounded-card border border-border bg-background/80 p-4 shadow-card backdrop-blur-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-secondary text-primary">
                  <Icon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <dt className="type-meta text-muted">{label}</dt>
                  <dd className="type-label mt-0.5 text-foreground">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </PageContainer>
      </section>

      {/* In-page section links, pinned under the site header */}
      <nav aria-label="Program sections" className="sticky top-16 z-30 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <PageContainer>
          <ul className="-mx-1 flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
            {sections.map((section) => (
              <li key={section.id} className="shrink-0">
                <a
                  href={`#${section.id}`}
                  className="block rounded-button px-3.5 py-1.5 type-supporting font-medium text-muted transition-colors hover:bg-secondary hover:text-secondary-foreground"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </PageContainer>
      </nav>

      <PageContainer className="py-10 sm:py-14">
        <ProgramFixtureNotice className="mb-10 max-w-3xl" />

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          {/* First in the DOM so the enrollment CTA appears early on mobile; a sticky sidebar on desktop. */}
          <aside className="lg:sticky lg:top-32 lg:col-start-2 lg:row-start-1 lg:self-start">
            {/* Online checkout needs the database (not sample data) and a configured payment provider. */}
            <EnrollmentPanel
              program={program}
              onlinePayment={getProgramDataSource() === "database" && getPaymentAvailability().available}
            />
          </aside>

          <div className="min-w-0 space-y-16 lg:col-start-1 lg:row-start-1">
            <DetailSection id="overview" title="Overview" Icon={InfoIcon}>
              <div className="space-y-4 type-body text-foreground">
                {program.overview.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {hasAudience && (
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {program.audience.length > 0 && <InfoCard title="Who it's for" Icon={UsersIcon} items={program.audience} />}
                  {program.prerequisites.length > 0 && (
                    <InfoCard title="Prerequisites" Icon={ListChecksIcon} items={program.prerequisites} />
                  )}
                </div>
              )}
            </DetailSection>

            {program.outcomes.length > 0 && (
              <DetailSection id="outcomes" title="What you'll learn" Icon={CheckCircleIcon}>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {program.outcomes.map((item) => (
                    <li key={item} className="flex gap-3 rounded-control border border-border bg-surface p-4 type-supporting text-foreground">
                      <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-success" />
                      {item}
                    </li>
                  ))}
                </ul>
              </DetailSection>
            )}

            {program.modules.length > 0 && (
              <DetailSection
                id="curriculum"
                title="Curriculum"
                Icon={BookOpenIcon}
                description={`${plural(program.modules.length, "module")} over ${formatDuration(program.durationWeeks)}, taken in order.`}
              >
                <ol className="space-y-3">
                  {program.modules.map((module, index) => {
                    const { title, summary, topics } = moduleDisplay(module);
                    const isLast = index === program.modules.length - 1;
                    return (
                      <li key={`${index}-${module.title}`} className="relative flex gap-4">
                        {!isLast && (
                          <span aria-hidden="true" className="absolute top-11 -bottom-3 left-5 w-px -translate-x-1/2 bg-border" />
                        )}
                        <span
                          aria-hidden="true"
                          className="relative grid size-10 shrink-0 place-items-center rounded-full bg-primary type-label text-on-primary shadow-button tabular-nums"
                        >
                          {twoDigits(index + 1)}
                        </span>
                        <div className="min-w-0 flex-1 rounded-card border border-border bg-background p-4 transition-colors hover:border-primary/30 sm:p-5">
                          <p className="type-meta font-semibold text-primary">Module {index + 1}</p>
                          <h3 className="type-card-title mt-0.5 text-foreground">{title}</h3>
                          {summary && <p className="type-supporting mt-1.5 text-muted">{summary}</p>}
                          {topics.length > 0 && (
                            <ul className="mt-3 flex flex-wrap gap-2">
                              {topics.map((topic) => (
                                <li key={topic} className="rounded-full bg-secondary/70 px-3 py-1 type-meta font-medium text-secondary-foreground">
                                  {topic}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </DetailSection>
            )}

            {hasProjects && (
              <DetailSection
                id="projects"
                title="Tasks and final project"
                Icon={CodeIcon}
                description="Each task lists the requirements your submission must meet, and every submission is reviewed against them."
              >
                {program.tasks.length > 0 && (
                  <ol className="grid gap-4 sm:grid-cols-2">
                    {program.tasks.map((task, index) => (
                      <li key={task.title} className="flex flex-col rounded-card border border-border bg-background p-5 shadow-card">
                        <div className="flex items-center justify-between gap-3">
                          <span className="type-meta font-semibold text-primary">Task {twoDigits(index + 1)}</span>
                          <ClipboardCheckIcon className="size-5 text-muted" />
                        </div>
                        <h3 className="type-label mt-2 text-foreground">{task.title}</h3>
                        <p className="type-supporting mt-1 text-muted">{task.description}</p>
                      </li>
                    ))}
                  </ol>
                )}
                {program.finalProject.trim() !== "" && (
                  <div className="relative mt-5 overflow-hidden rounded-card bg-linear-to-br from-primary to-primary-strong p-6 text-on-primary shadow-raised sm:p-7">
                    <span aria-hidden="true" className="absolute -top-12 -right-10 size-40 rounded-full bg-accent/25 blur-3xl" />
                    <div className="relative flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-control bg-on-primary/15 ring-1 ring-on-primary/25">
                        <AwardIcon className="size-5" />
                      </span>
                      <h3 className="type-card-title">Final project</h3>
                    </div>
                    <p className="type-body relative mt-4 text-on-primary/90">{program.finalProject}</p>
                  </div>
                )}
              </DetailSection>
            )}

            <DetailSection
              id="certificate"
              title="Earning your certificate"
              Icon={AwardIcon}
              description="You receive a certificate once you have completed every step below."
            >
              <ol className="space-y-3 rounded-card border border-border bg-surface p-5 sm:p-6">
                {program.completionCriteria.map((item, index) => (
                  <li key={item} className="flex items-start gap-3 type-body text-foreground">
                    <span
                      aria-hidden="true"
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-background type-meta font-bold text-primary ring-1 ring-primary/25"
                    >
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{item}</span>
                  </li>
                ))}
              </ol>
              <Notice tone="info" title="Enrolling does not by itself earn a certificate" className="mt-5">
                Certificates are issued only when all of the steps above are met. Read the{" "}
                <Link href="/certificate-policy" className="font-semibold underline underline-offset-2">
                  certificate policy
                </Link>{" "}
                for details.
              </Notice>
            </DetailSection>

            <DetailSection id="program-faq" title="Questions about this program" Icon={InfoIcon}>
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
    </>
  );
}

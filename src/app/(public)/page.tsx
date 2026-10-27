import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, PageSection } from "@/components/layout/page-container";
import { ProgramFixtureNotice } from "@/components/programs/program-fixture-notice";
import { ProgramGrid } from "@/components/programs/program-grid";
import { CtaSection } from "@/components/sections/cta-section";
import { FaqList } from "@/components/sections/faq-list";
import { HeroIllustration } from "@/components/sections/hero-illustration";
import { ButtonArrow, ButtonLink } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRightIcon,
  AwardIcon,
  ClipboardCheckIcon,
  CodeIcon,
  ListChecksIcon,
  SearchIcon,
  ShieldCheckIcon,
  UploadIcon,
  UserPlusIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { SectionHeading } from "@/components/ui/section-heading";
import { brand } from "@/config/brand";
import { featuredFaqs } from "@/data/faqs";
import { Notice } from "@/components/ui/notice";
import { loadPrograms } from "@/lib/programs";
import { reveal, revealStagger } from "@/lib/reveal";
import { canonical } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return {
    // Uses the root layout's default title.
    description: `${brand.name} helps students learn practical technology skills through affordable, project-based online training. Explore programs and verify certificates.`,
    ...canonical("/"),
  };
}

const journey = [
  { title: "Explore a program", body: "Compare programs by topic, level, duration and price.", Icon: SearchIcon },
  { title: "Enroll", body: "Join the program that fits your goals once enrollment opens.", Icon: UserPlusIcon },
  { title: "Learn and build", body: "Work through each module and complete its project tasks.", Icon: CodeIcon },
  { title: "Submit your work", body: "Submit the required tasks and final project for review.", Icon: UploadIcon },
  {
    title: "Earn a certificate",
    body: "Receive a certificate if your work meets the program's published completion criteria.",
    Icon: AwardIcon,
  },
] as const;

const benefits = [
  {
    title: "Affordable learning",
    body: "Programs are priced to be accessible for students, and each program's price is shown before you enroll.",
    Icon: WalletIcon,
  },
  {
    title: "Hands-on project practice",
    body: "You learn by building: every module includes practical work that adds up to a finished project.",
    Icon: CodeIcon,
  },
  {
    title: "Clear, task-based learning",
    body: "Each task states what to build and the requirements it must meet, so you always know what is expected.",
    Icon: ListChecksIcon,
  },
  {
    title: "Transparent completion criteria",
    body: "Every program publishes its completion criteria up front, so you know exactly what earns a certificate.",
    Icon: ClipboardCheckIcon,
  },
  {
    title: "Online certificate verification",
    body: "Each certificate carries a unique ID and QR code that anyone can check on this website.",
    Icon: ShieldCheckIcon,
  },
] as const;

export default async function HomePage() {
  const { programs: featuredPrograms, unavailable: programsUnavailable } = await loadPrograms({ featured: 3 });

  return (
    <>
      {/* Hero */}
      <section
        aria-labelledby="hero-heading"
        className="relative isolate overflow-hidden border-b border-border bg-linear-to-b from-secondary/40 to-background"
      >
        <div aria-hidden="true" className="bg-dot-grid absolute inset-0 -z-10" />
        {/* Hero content plays a short, one-off entrance sequence (CSS only, so it never waits for JavaScript). */}
        <PageContainer className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div className="min-w-0">
            <p className="inline-flex animate-fade-up items-center gap-2 rounded-button border border-primary/15 bg-background/70 px-3 py-1 type-eyebrow text-primary shadow-card backdrop-blur-sm">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
              {brand.description}
            </p>
            <h1 id="hero-heading" className="type-display mt-5 animate-fade-up text-foreground stagger-1">
              Build Real Skills. <span className="text-primary">Create Real Projects.</span>
            </h1>
            <p className="type-lead mt-6 max-w-xl animate-fade-up text-muted stagger-2">
              {brand.name} helps students learn practical technology skills through affordable, project-based training.
              Instead of only watching lessons, you complete real tasks and build projects you can show.
            </p>
            <div className="mt-8 flex animate-fade-up flex-col gap-3 stagger-3 sm:flex-row">
              <ButtonLink href="/programs" size="lg">
                Explore Programs
                <ButtonArrow />
              </ButtonLink>
              <ButtonLink href="/verify" size="lg" variant="outline">
                Verify a Certificate
              </ButtonLink>
            </div>
          </div>
          <HeroIllustration />
        </PageContainer>
      </section>

      {/* How it works */}
      <PageSection labelledBy="how-heading">
        <SectionHeading
          id="how-heading"
          eyebrow="How it works"
          title="From first lesson to finished project"
          description="Every program follows the same clear path. A certificate is earned by completing the work, not by enrolling."
        />
        <ol {...revealStagger} className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {journey.map((step, index) => (
            <Card as="li" key={step.title} className="bg-linear-to-b from-surface to-background">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-secondary text-secondary-foreground">
                  <step.Icon className="size-5" />
                </span>
                <span className="rounded-button bg-foreground/5 px-2 py-0.5 type-meta text-muted tabular-nums">Step {index + 1}</span>
              </div>
              <CardHeader className="mt-4">
                <CardTitle>{step.title}</CardTitle>
                <CardDescription>{step.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </ol>
      </PageSection>

      {/* Featured programs */}
      <PageSection labelledBy="programs-heading" tone="muted">
        <SectionHeading
          id="programs-heading"
          eyebrow="Programs"
          title="Featured programs"
          description="Short, practical programs that each end with a project you build yourself."
          action={{ label: "View All Programs", href: "/programs" }}
        />
        <ProgramFixtureNotice className="mt-8" />
        <div className="mt-8">
          {programsUnavailable ? (
            <Notice tone="warning" title="Programs can't be shown right now">
              We couldn&apos;t load the programs because of a temporary problem. Please try again in a few minutes.
            </Notice>
          ) : (
            <ProgramGrid programs={featuredPrograms} headingLevel="h3" />
          )}
        </div>
      </PageSection>

      {/* Why choose */}
      <PageSection labelledBy="why-heading">
        <SectionHeading
          id="why-heading"
          eyebrow={`Why ${brand.name}`}
          title={`Why choose ${brand.name}`}
          description="A straightforward way to build practical skills, with clear expectations at every step."
        />
        <ul {...revealStagger} className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => (
            <li key={benefit.title} className="group flex gap-4">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-secondary text-secondary-foreground ring-1 ring-primary/10 transition-[background-color,color,scale] duration-300 ease-out-soft group-hover:scale-105 group-hover:bg-primary group-hover:text-on-primary">
                <benefit.Icon className="size-5" />
              </span>
              <div>
                <h3 className="type-card-title text-foreground">{benefit.title}</h3>
                <p className="type-supporting mt-1.5 text-muted">{benefit.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </PageSection>

      {/* Certificate verification */}
      <PageSection labelledBy="verify-heading" tone="muted">
        <div
          {...reveal}
          className="grid items-center gap-8 rounded-card border border-border bg-background p-6 shadow-card sm:p-10 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-12"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-14 items-center justify-center rounded-card bg-success/10 text-success ring-1 ring-success/20"
          >
            <ShieldCheckIcon className="size-7" />
          </span>
          <div>
            <p className="type-eyebrow text-primary">For employers and institutions</p>
            <h2 id="verify-heading" className="type-section-title mt-2 text-foreground">
              Certificates you can check online
            </h2>
            <p className="type-lead mt-3 max-w-2xl text-muted">
              Each {brand.name} certificate includes a unique certificate ID and a QR code. Anyone can enter the ID on our
              verification page, or scan the code, to see the certificate&apos;s current recorded status.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <ButtonLink href="/verify" size="lg">
              Go to verification
              <ButtonArrow />
            </ButtonLink>
            <ButtonLink href="/certificate-policy" size="lg" variant="outline">
              Certificate policy
            </ButtonLink>
          </div>
        </div>
      </PageSection>

      {/* FAQ preview */}
      <PageSection labelledBy="faq-heading">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-16">
          <div>
            <SectionHeading
              id="faq-heading"
              eyebrow="FAQs"
              title="Common questions"
              description="Quick answers about how programs, tasks and certificates work."
            />
            <Link
              href="/faq"
              className="group mt-6 inline-flex items-center gap-1.5 rounded-control type-button text-primary transition-colors hover:text-primary-strong"
            >
              View all FAQs
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <FaqList items={featuredFaqs} />
        </div>
      </PageSection>

      <CtaSection
        id="cta-heading"
        title="Ready to start building?"
        description="Browse the programs, compare what each one covers, and choose the skills you want to build next."
        primary={{ label: "Explore Programs", href: "/programs" }}
        secondary={{ label: "Have a question? Contact us", href: "/contact" }}
      />
    </>
  );
}

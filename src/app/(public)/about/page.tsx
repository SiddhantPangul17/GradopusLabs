import type { Metadata } from "next";
import { PageContainer, PageSection } from "@/components/layout/page-container";
import { CtaSection } from "@/components/sections/cta-section";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheckIcon, CodeIcon, ListChecksIcon, WalletIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { SectionHeading } from "@/components/ui/section-heading";
import { brand } from "@/config/brand";
import { canonical } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return {
    title: "About",
    description: `Why ${brand.name} exists: making practical technology learning accessible through affordable, project-based training with transparent certificate criteria.`,
    ...canonical("/about"),
  };
}

const principles = [
  {
    title: "Accessible learning",
    body: "Practical technology skills should not depend on being able to afford expensive courses. Programs are priced with students in mind.",
    Icon: WalletIcon,
  },
  {
    title: "Learning by building",
    body: "Skills stick when you use them. Each program is built around projects, so you finish with work you created yourself.",
    Icon: CodeIcon,
  },
  {
    title: "Structured tasks and feedback",
    body: "Clear tasks break each program into achievable steps. Submissions are reviewed against published requirements, so you know where you stand.",
    Icon: ListChecksIcon,
  },
  {
    title: "Fair, transparent certificates",
    body: "Completion criteria are published before you enrol. A certificate is awarded for meeting them, and nothing else.",
    Icon: ClipboardCheckIcon,
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <PageContainer size="narrow" className="py-12 sm:py-16 lg:py-20">
        <p className="type-eyebrow text-primary">About {brand.name}</p>
        <h1 className="type-page-title mt-2 text-foreground">Practical skills, built through real projects</h1>
        <div className="prose-content mt-6 type-lead text-muted">
          <p>
            {brand.name} is an online training platform for students who want to learn technology skills by doing. Our
            programs are affordable, delivered virtually and organised around hands-on projects rather than lectures
            alone.
          </p>
          <p>
            We believe the best way to learn a skill is to use it: to plan something, build it, get it reviewed against
            clear requirements and improve it. That is the experience each program is designed to give you.
          </p>
        </div>
      </PageContainer>

      <PageSection labelledBy="principles-heading" tone="muted">
        <SectionHeading id="principles-heading" eyebrow="What we stand for" title="Our approach" />
        <ul className="mt-10 grid gap-6 sm:grid-cols-2">
          {principles.map((principle) => (
            <Card as="li" key={principle.title}>
              <span className="inline-flex size-11 items-center justify-center rounded-control bg-secondary text-secondary-foreground">
                <principle.Icon className="size-5" />
              </span>
              <CardHeader className="mt-4">
                <CardTitle>{principle.title}</CardTitle>
                <CardDescription>{principle.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </ul>
      </PageSection>

      <PageSection labelledBy="status-heading" size="narrow">
        <h2 id="status-heading" className="type-section-title text-foreground">
          Where we are today
        </h2>
        <div className="prose-content mt-4">
          <p>
            {brand.name} is a new platform. Programs, enrolment, project submission and online certificate verification
            are available; some features, such as file uploads, are still being built.
          </p>
          <p>
            We will only describe features as available once they actually work. If something on this site is marked
            &ldquo;coming soon&rdquo; or &ldquo;not available yet&rdquo;, that is exactly what it means.
          </p>
        </div>
        <Notice tone="info" title="About our certificates" className="mt-6">
          {brand.name} certificates show completion of a specific {brand.name} program. They are not a government
          qualification, university degree or accredited credential.
        </Notice>
      </PageSection>

      <CtaSection
        id="about-cta-heading"
        title="See what you could build"
        description="Explore the programs and find the project-based training that matches your goals."
        primary={{ label: "Explore Programs", href: "/programs" }}
        secondary={{ label: "Read the FAQs", href: "/faq" }}
      />
    </>
  );
}

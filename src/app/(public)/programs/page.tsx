import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { ProgramFixtureNotice } from "@/components/programs/program-fixture-notice";
import { ProgramGrid } from "@/components/programs/program-grid";
import { SectionHeading } from "@/components/ui/section-heading";
import { brand } from "@/config/brand";
import { Notice } from "@/components/ui/notice";
import { loadPrograms } from "@/lib/programs";
import { canonical } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return {
    title: "Programs",
    description: `Browse ${brand.name}'s project-based training programs. Compare topics, levels, duration and price, and see what each program asks you to build.`,
    ...canonical("/programs"),
  };
}

export default async function ProgramsPage() {
  const { programs, unavailable } = await loadPrograms();

  return (
    <PageContainer className="py-12 sm:py-16 lg:py-20">
      <SectionHeading
        as="h1"
        eyebrow="Programs"
        title="Explore programs"
        description="Each program combines short lessons with practical tasks and a final project. Check the level, duration and price, then open a program to see its full curriculum and completion criteria."
      />
      <ProgramFixtureNotice className="mt-8" />
      <div className="mt-10">
        {unavailable ? (
          <Notice tone="warning" title="Programs can't be shown right now">
            We couldn&apos;t load the programs because of a temporary problem. Please try again in a few minutes.
          </Notice>
        ) : (
          <ProgramGrid programs={programs} headingLevel="h2" />
        )}
      </div>
      <p className="type-supporting mt-12 text-center text-muted">
        Not sure which program is right for you? Read the{" "}
        <Link href="/faq" className="font-semibold text-primary underline underline-offset-4">
          FAQs
        </Link>{" "}
        or{" "}
        <Link href="/contact" className="font-semibold text-primary underline underline-offset-4">
          contact us
        </Link>
        .
      </p>
    </PageContainer>
  );
}

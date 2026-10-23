import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { CtaSection } from "@/components/sections/cta-section";
import { FaqList } from "@/components/sections/faq-list";
import { brand } from "@/config/brand";
import { faqGroups } from "@/data/faqs";
import { canonical } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return {
    title: "FAQs",
    description: `Answers to common questions about ${brand.name} programs, project tasks, certificates, verification and payments.`,
    ...canonical("/faq"),
  };
}

export default function FaqPage() {
  return (
    <>
      <PageContainer size="narrow" className="pt-12 sm:pt-16 lg:pt-20">
        <p className="type-eyebrow text-primary">FAQs</p>
        <h1 className="type-page-title mt-2 text-foreground">Frequently asked questions</h1>
        <p className="type-lead mt-4 text-muted">
          Answers about programs, project tasks, certificates and payments. Answers labelled &ldquo;Draft&rdquo; depend
          on policies that are still being finalised.
        </p>
        <nav aria-label="FAQ topics" className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {faqGroups.map((group) => (
              <li key={group.id}>
                <a
                  href={`#${group.id}`}
                  className="inline-flex min-h-9 items-center rounded-full border border-border bg-background px-3.5 type-supporting font-medium text-foreground hover:border-border-strong hover:bg-surface"
                >
                  {group.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </PageContainer>

      <PageContainer size="narrow" className="space-y-12 py-10 sm:py-12">
        {faqGroups.map((group) => (
          <section key={group.id} id={group.id} aria-labelledby={`${group.id}-heading`}>
            <h2 id={`${group.id}-heading`} className="text-xl font-semibold tracking-tight text-foreground">
              {group.title}
            </h2>
            <FaqList items={group.items} className="mt-4" />
          </section>
        ))}
      </PageContainer>

      <CtaSection
        id="faq-cta-heading"
        title="Still have a question?"
        description="If your question is not answered here, send us a message."
        primary={{ label: "Contact us", href: "/contact" }}
        secondary={{ label: "Browse programs", href: "/programs" }}
      />
    </>
  );
}

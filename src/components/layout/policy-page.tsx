import type { Metadata } from "next";
import { PolicyLayout } from "@/components/layout/policy-layout";
import { PolicyMarkdown } from "@/components/layout/policy-markdown";
import { getPolicy, type PolicySlug } from "@/config/policies";
import { loadPolicy } from "@/lib/policies/load";
import { canonical } from "@/lib/seo";

export function policyMetadata(slug: PolicySlug): Metadata {
  const policy = getPolicy(slug);
  return { title: policy.title, description: policy.description, ...canonical(policy.href) };
}

/** A policy page rendered from docs/policies/<slug>.md. */
export async function PolicyPage({ slug }: { slug: PolicySlug }) {
  const policy = getPolicy(slug);
  const document = await loadPolicy(slug);

  return (
    <PolicyLayout
      title={policy.title}
      intro={
        <div className="rounded-card border border-border bg-surface px-5 py-4">
          <PolicyMarkdown>{document.intro}</PolicyMarkdown>
        </div>
      }
      sections={document.sections.map((section) => ({
        id: section.id,
        number: section.number,
        title: section.title,
        content: <PolicyMarkdown>{section.body}</PolicyMarkdown>,
      }))}
    />
  );
}

import { brand } from "@/config/brand";

/**
 * Published policies. Each one is a Markdown file in docs/policies/<slug>.md,
 * which is the single source of truth: the website renders it as-is (minus
 * reviewer notes and legal-review markers, see src/lib/policies/markdown.ts).
 * Changing a policy means editing its Markdown file and adding a line to its
 * revision history.
 */
export const policies = [
  {
    slug: "terms-and-conditions",
    href: "/terms",
    title: "Student Terms & Conditions",
    navLabel: "Terms & Conditions",
    description: `The general rules for taking part in ${brand.name} programs.`,
  },
  {
    slug: "privacy-policy",
    href: "/privacy",
    title: "Privacy Policy",
    navLabel: "Privacy Policy",
    description: `What personal data ${brand.name} collects, why, who can see it and what you can ask us to do.`,
  },
  {
    slug: "internship-policy",
    href: "/internship-policy",
    title: "Internship Policy",
    navLabel: "Internship Policy",
    description: `How ${brand.name} internships work, from joining a program to completing it.`,
  },
  {
    slug: "project-assessment-policy",
    href: "/assessment-policy",
    title: "Project Submission & Assessment Policy",
    navLabel: "Submission & Assessment",
    description: `How ${brand.name} tasks are set, submitted, assessed and reviewed.`,
  },
  {
    slug: "certificate-policy",
    href: "/certificate-policy",
    title: "Certificate Issuance & Verification Policy",
    navLabel: "Certificate Policy",
    description: `When ${brand.name} certificates are issued, what they show, and how they are verified, corrected or revoked.`,
  },
  {
    slug: "payment-refund-policy",
    href: "/refund-policy",
    title: "Payment, Refund & Stipend Policy",
    navLabel: "Payment & Refund Policy",
    description: `What you pay to join a ${brand.name} program, when money is returned, and the position on stipends.`,
  },
  {
    slug: "intellectual-property-code-of-conduct",
    href: "/intellectual-property",
    title: "Intellectual Property & Code of Conduct",
    navLabel: "IP & Code of Conduct",
    description: `Expected conduct in ${brand.name} programs, and who owns the work, code and materials involved.`,
  },
] as const;

export type PolicyEntry = (typeof policies)[number];
export type PolicySlug = PolicyEntry["slug"];

export function getPolicy(slug: PolicySlug): PolicyEntry {
  return policies.find((policy) => policy.slug === slug)!;
}

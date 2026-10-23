import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { NavItem } from "@/types";

type PlaceholderPageProps = {
  title: string;
  description: string;
  /** Capabilities planned for this area, listed as upcoming (not available). */
  planned: readonly string[];
  /** Optional related page, shown next to "Back to home". */
  related?: NavItem;
};

/** Clearly labelled stand-in for a route whose feature is not built yet. */
export function PlaceholderPage({ title, description, planned, related }: PlaceholderPageProps) {
  return (
    <PageContainer size="narrow" className="py-12 sm:py-16 lg:py-20">
      <StatusBadge status="pending">Under construction</StatusBadge>
      <h1 className="type-page-title mt-4 text-foreground">{title}</h1>
      <p className="type-lead mt-4 text-muted">{description}</p>

      <Card as="section" className="mt-8 bg-surface">
        <CardHeader>
          <CardTitle as="h2">Planned for a later release</CardTitle>
        </CardHeader>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 type-supporting text-muted">
          {planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-4 type-supporting font-medium text-foreground">This feature is not available yet.</p>
      </Card>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {related && <ButtonLink href={related.href}>{related.label}</ButtonLink>}
        <ButtonLink href="/" variant="outline">
          Back to home
        </ButtonLink>
      </div>
    </PageContainer>
  );
}

import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button";

export default function ProgramNotFound() {
  return (
    <PageContainer size="narrow" className="py-16 sm:py-24">
      <p className="type-eyebrow text-primary">Program not found</p>
      <h1 className="type-page-title mt-2 text-foreground">We could not find that program</h1>
      <p className="type-lead mt-4 text-muted">
        The program may have been renamed or is no longer listed. Browse the current programs instead.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/programs">View all programs</ButtonLink>
        <ButtonLink href="/" variant="outline">
          Go to home
        </ButtonLink>
      </div>
    </PageContainer>
  );
}

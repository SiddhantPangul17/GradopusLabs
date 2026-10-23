import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
};

// Rendered inside the root layout only, so it adds the public chrome itself.
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <PageContainer size="narrow" className="py-16 sm:py-24">
          <p className="type-eyebrow text-primary">Error 404</p>
          <h1 className="type-page-title mt-2 text-foreground">Page not found</h1>
          <p className="type-lead mt-4 text-muted">The page you are looking for does not exist or has been moved.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/">Go to home</ButtonLink>
            <ButtonLink href="/programs" variant="outline">
              View programs
            </ButtonLink>
          </div>
        </PageContainer>
      </main>
      <SiteFooter />
    </>
  );
}

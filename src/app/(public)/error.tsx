"use client";

import { useEffect } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, ButtonLink } from "@/components/ui/button";

// Error boundary for public pages; the shared header and footer stay visible.
export default function PublicError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer size="narrow" className="py-16 sm:py-24">
      <p className="type-eyebrow text-error">Something went wrong</p>
      <h1 className="type-page-title mt-2 text-foreground">This page could not be loaded</h1>
      <p className="type-lead mt-4 text-muted">
        A temporary problem stopped this page from loading. Please try again. If the problem continues, come back later.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => retry()}>Try again</Button>
        <ButtonLink href="/" variant="outline">
          Go to home
        </ButtonLink>
      </div>
    </PageContainer>
  );
}

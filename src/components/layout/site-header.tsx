import { Suspense } from "react";
import { AccountControls, AccountControlsFallback } from "@/components/layout/account-controls";
import { BrandLogo } from "@/components/layout/brand-logo";
import { PageContainer } from "@/components/layout/page-container";
import { SiteNav } from "@/components/layout/site-nav";

export function SiteHeader() {
  return (
    // `sticky` also makes the header the positioning context for the mobile menu panel.
    <header className="header-elevate sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md backdrop-saturate-150">
      <PageContainer className="flex h-16 items-center justify-between gap-4">
        <BrandLogo />
        <SiteNav
          // The account area reads the session, so it streams in; the rest of the header stays static.
          desktopAccount={
            <Suspense fallback={<AccountControlsFallback variant="desktop" />}>
              <AccountControls variant="desktop" />
            </Suspense>
          }
          mobileAccount={
            <Suspense fallback={<AccountControlsFallback variant="mobile" />}>
              <AccountControls variant="mobile" />
            </Suspense>
          }
        />
      </PageContainer>
    </header>
  );
}

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AdminNav, AdminNavView } from "@/components/admin/admin-nav";
import { LogoutButton } from "@/components/auth/logout-button";
import { BrandLogo } from "@/components/layout/brand-logo";
import { PageContainer } from "@/components/layout/page-container";
import { getCurrentUser } from "@/lib/auth/session";

/** Shows the signed-in admin and a logout button. Display only: each admin page authorizes itself. */
async function AdminAccount() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return null;
  return (
    <div className="flex items-center gap-3">
      <span className="hidden type-supporting text-muted sm:inline">{user.name}</span>
      <LogoutButton />
    </div>
  );
}

/**
 * Admin shell, separate from the public header/footer but in the same app and
 * domain. Authorization is NOT done here (layouts do not re-run on every
 * navigation); every admin page and API calls requireAdmin()/authorizeApiRequest().
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-border bg-background">
        {/* Wraps onto two lines on very narrow screens instead of overflowing. */}
        <PageContainer className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
          <div className="flex items-center gap-3">
            <BrandLogo />
            <span className="rounded-button bg-secondary px-2.5 py-0.5 type-meta font-semibold text-secondary-foreground">Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="rounded-control type-supporting font-medium text-primary underline-offset-4 transition-colors hover:text-primary-strong hover:underline">
              Back to website
            </Link>
            <Suspense fallback={null}>
              <AdminAccount />
            </Suspense>
          </div>
        </PageContainer>
      </header>
      {/* Active-link state reads the URL (dynamic admin routes), so it streams in. */}
      <Suspense fallback={<AdminNavView pathname={null} />}>
        <AdminNav />
      </Suspense>
      <main id="main" className="flex-1">
        <PageContainer className="py-8 sm:py-10">{children}</PageContainer>
      </main>
    </>
  );
}

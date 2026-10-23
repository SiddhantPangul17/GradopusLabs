import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/ui/card";
import { SpinnerIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";

type AuthShellProps = {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/** Centred card layout shared by the login, registration and password pages. */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="relative isolate">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-80 bg-linear-to-b from-secondary/50 to-transparent" />
      <PageContainer className="py-12 sm:py-16">
        <div className="mx-auto w-full max-w-md">
          <h1 className="type-page-title animate-fade-up text-center text-foreground">{title}</h1>
          <p className="type-body mt-3 animate-fade-up text-center text-muted stagger-1">{description}</p>
          <Card elevated className="mt-8 animate-fade-up stagger-2 sm:p-8">
            {children}
          </Card>
          {footer && <div className="type-supporting mt-6 animate-fade-in space-y-2 text-center text-muted stagger-4">{footer}</div>}
        </div>
      </PageContainer>
    </div>
  );
}

export function AuthFormFallback() {
  return (
    <div role="status" className="flex animate-fade-in items-center justify-center gap-3 py-10 type-supporting text-muted stagger-2">
      <SpinnerIcon className="size-5 animate-spin text-primary" />
      Loading…
    </div>
  );
}

/** Shown instead of a form when AUTH_SECRET or the database is not configured. */
export function AuthUnavailable() {
  return (
    <Notice tone="warning" title="Accounts are not available yet">
      Signing in and creating accounts are not available on this site at the moment. Please try again later.
      {process.env.NODE_ENV === "development" && (
        <span className="mt-2 block">
          Development: set <code>AUTH_SECRET</code> and <code>MONGODB_URI</code> in <code>.env.local</code> (see
          docs/authentication.md).
        </span>
      )}
    </Notice>
  );
}

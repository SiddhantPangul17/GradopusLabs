import Link from "next/link";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Page heading for admin screens, with optional breadcrumb and actions. */
export function AdminHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: ReactNode;
  breadcrumb?: { label: string; href: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 animate-fade-up-sm">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="type-supporting mb-3 text-muted">
          {breadcrumb.map((item, index) => (
            <span key={item.href}>
              {index > 0 && <span aria-hidden="true"> / </span>}
              <Link href={item.href} className="rounded-control underline-offset-4 transition-colors hover:text-foreground hover:underline">
                {item.label}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="type-page-title wrap-anywhere text-foreground">{title}</h1>
          {description && <div className="type-body mt-2 max-w-3xl text-muted">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
      </div>
    </div>
  );
}

/** Page-shaped placeholder (heading, figures, list) while an admin page loads. */
export function AdminLoading() {
  return (
    <div role="status" className="animate-fade-in">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="mt-3 h-5 w-96 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="mt-8 h-64 rounded-card" />
    </div>
  );
}

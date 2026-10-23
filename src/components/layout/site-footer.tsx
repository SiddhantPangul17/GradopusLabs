import Link from "next/link";
import { BrandLogo } from "@/components/layout/brand-logo";
import { CurrentYear } from "@/components/layout/current-year";
import { PageContainer } from "@/components/layout/page-container";
import { brand } from "@/config/brand";
import { footerNavigation } from "@/config/navigation";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <PageContainer className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="max-w-sm space-y-3 sm:col-span-2 lg:col-span-1">
          <BrandLogo />
          <p className="type-supporting text-muted">{brand.summary}</p>
        </div>

        {footerNavigation.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="type-label text-foreground">{group.title}</h2>
            <ul className="mt-3 space-y-1">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-9 items-center rounded-control type-supporting text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </PageContainer>

      <div className="border-t border-border">
        <PageContainer className="py-5">
          <p className="type-meta text-muted">
            &copy; <CurrentYear /> {brand.name}. All rights reserved.
          </p>
        </PageContainer>
      </div>
    </footer>
  );
}

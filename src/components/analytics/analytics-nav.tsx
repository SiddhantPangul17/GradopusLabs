"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { tabLinkStyles } from "@/components/ui/tab-link";

const tabs = [
  { label: "Overview", href: "/admin/analytics" },
  { label: "Programs", href: "/admin/analytics/programs" },
  { label: "Revenue", href: "/admin/analytics/revenue" },
  { label: "Learning", href: "/admin/analytics/learning" },
  { label: "Certificates", href: "/admin/analytics/certificates" },
  { label: "Operations", href: "/admin/analytics/operations" },
] as const;

const KEEP = ["period", "from", "to", "mode"];

/** Report tabs that keep the selected filters. Navigation only: each page authorizes itself. */
export function AnalyticsNavView({ pathname, search }: { pathname: string | null; search: string }) {
  return (
    <nav aria-label="Reports" className="mb-6 border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={`${tab.href}${search}`}
                aria-current={active ? "page" : undefined}
                className={tabLinkStyles(active, "h-10")}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AnalyticsNav() {
  const params = useSearchParams();
  const kept = new URLSearchParams();
  for (const key of KEEP) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const search = kept.toString();
  return <AnalyticsNavView pathname={usePathname()} search={search ? `?${search}` : ""} />;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabLinkStyles } from "@/components/ui/tab-link";

const items = [
  { label: "Overview", href: "/admin", exact: true },
  { label: "Analytics", href: "/admin/analytics", exact: false },
  { label: "Programs", href: "/admin/programs", exact: false },
  { label: "Submissions", href: "/admin/submissions", exact: false },
  { label: "Students", href: "/admin/students", exact: false },
  { label: "Enrollments", href: "/admin/enrollments", exact: false },
  { label: "Payments", href: "/admin/payments", exact: false },
  { label: "Certificates", href: "/admin/certificates", exact: false },
  { label: "Emails", href: "/admin/notifications", exact: false },
  { label: "Audit log", href: "/admin/audit-logs", exact: false },
] as const;

/** Admin section links. Navigation only: every admin page and action authorizes itself. */
export function AdminNavView({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Admin sections" className="border-b border-border bg-background">
      <ul className="mx-auto -mb-px flex w-full max-w-page gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {items.map((item) => {
          const active =
            pathname !== null && (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={tabLinkStyles(active, "h-11")}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Reads the URL for the active state; render inside <Suspense> with AdminNavView as fallback. */
export function AdminNav() {
  return <AdminNavView pathname={usePathname()} />;
}

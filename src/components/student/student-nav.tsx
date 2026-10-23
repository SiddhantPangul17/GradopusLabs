"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabLinkStyles } from "@/components/ui/tab-link";

const items = [
  { label: "Overview", href: "/student", exact: true },
  { label: "My programs", href: "/student/programs", exact: false },
  { label: "Submissions", href: "/student/submissions", exact: false },
  { label: "Certificates", href: "/student/certificates", exact: false },
  { label: "Payments", href: "/student/payments", exact: false },
  { label: "Notifications", href: "/student/notifications", exact: false },
  { label: "Profile", href: "/student/profile", exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  // Task pages belong to "My programs".
  return href === "/student/programs" && pathname.startsWith("/student/tasks/");
}

/**
 * The links themselves. With pathname null (while the URL streams in), nothing
 * is highlighted. `unread` adds a count to "Notifications" (text, not colour only).
 */
export function StudentNavView({ pathname, unread = 0 }: { pathname: string | null; unread?: number }) {
  return (
    <nav aria-label="Student area" className="border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = pathname !== null && isActive(pathname, item.href, item.exact);
          const count = item.href === "/student/notifications" && unread > 0 ? unread : 0;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                // `relative` (in tabLinkStyles) keeps the visually hidden "unread" text inside the scrollable tab strip.
                className={tabLinkStyles(active, "h-11")}
              >
                {item.label}
                {count > 0 && (
                  <span className="animate-pop-in rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-on-primary">
                    {count > 99 ? "99+" : count}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Sub-navigation for the student area. Navigation only: every page authorizes
 * itself. Reads the URL, so it must be rendered inside <Suspense> (dynamic
 * routes such as /student/programs/[enrollmentId] are not known at build time).
 */
export function StudentNav({ unread = 0 }: { unread?: number }) {
  return <StudentNavView pathname={usePathname()} unread={unread} />;
}

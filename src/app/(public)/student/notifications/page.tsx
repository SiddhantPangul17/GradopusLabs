import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/action-button";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SectionHeading } from "@/components/ui/section-heading";
import { requireStudent } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/learning/labels";
import { listOwnNotifications } from "@/lib/services/notification-service";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/student/actions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false },
};

async function Notifications({ searchParams }: { searchParams: PageProps<"/student/notifications">["searchParams"] }) {
  const user = await requireStudent("/student/notifications");
  const raw = (await searchParams).page;
  const requested = Number.parseInt(Array.isArray(raw) ? (raw[0] ?? "1") : (raw ?? "1"), 10);
  const { items, page, totalPages, total, unread } = await listOwnNotifications({ id: user.id, role: user.role }, requested);

  return (
    <>
      <SectionHeading as="h1" title="Notifications" description="Updates about your account, payments, reviews and certificates." />
      {total === 0 ? (
        <EmptyState className="mt-8" title="No notifications yet" description="You'll see updates here when something changes on your account." />
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="type-supporting text-muted" aria-live="polite">
              {unread === 0 ? "All caught up." : `${unread} unread`} · page {page} of {totalPages}
            </p>
            {unread > 0 && <ActionButton action={markAllNotificationsReadAction} label="Mark all as read" pendingLabel="Saving…" />}
          </div>
          <ul className="mt-4 divide-y divide-border rounded-card border border-border">
            {items.map((item) => (
              <li key={item.id} className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between", !item.read && "bg-secondary/30")}>
                <div className="min-w-0">
                  <p className="type-label wrap-anywhere text-foreground">
                    {!item.read && (
                      <span className="mr-2 inline-block size-2 rounded-full bg-primary align-middle" aria-hidden="true" />
                    )}
                    {!item.read && <span className="sr-only">Unread: </span>}
                    {item.link ? (
                      <Link href={item.link} className="text-primary underline-offset-4 hover:underline">
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                  </p>
                  <p className="type-supporting mt-1 wrap-anywhere text-foreground">{item.message}</p>
                  <p className="type-meta mt-1 text-muted">
                    <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                  </p>
                </div>
                {!item.read && (
                  <ActionButton
                    action={markNotificationReadAction.bind(null, item.id)}
                    label="Mark as read"
                    ariaLabel={`Mark "${item.title}" as read`}
                    pendingLabel="Saving…"
                  />
                )}
              </li>
            ))}
          </ul>
          <Pagination label="Notification pages" page={page} totalPages={totalPages} hrefFor={(target) => `/student/notifications?page=${target}`} previousLabel="Newer" nextLabel="Older" />
        </>
      )}
    </>
  );
}

export default function NotificationsPage({ searchParams }: PageProps<"/student/notifications">) {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <Notifications searchParams={searchParams} />
    </Suspense>
  );
}

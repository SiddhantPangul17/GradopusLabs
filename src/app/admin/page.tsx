import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { Card, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { auditActionLabel, programStatusDisplay } from "@/lib/admin/labels";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/learning/labels";
import { revealStagger } from "@/lib/reveal";
import { getAdminOverview } from "@/lib/services/admin-service";

export const metadata: Metadata = {
  title: "Admin dashboard",
  robots: { index: false },
};

function Metric({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full flex-col rounded-card border border-border bg-background p-4 shadow-card transition-[border-color,box-shadow,translate] duration-300 ease-out-soft hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-hover sm:p-5"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="type-supporting text-muted">{label}</span>
          <ArrowRightIcon className="size-4 shrink-0 -translate-x-1 text-primary opacity-0 transition-[opacity,translate] group-hover:translate-x-0 group-hover:opacity-100" />
        </span>
        <span className="mt-auto block pt-2 text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</span>
      </Link>
    </li>
  );
}

async function Overview() {
  // Authorization happens here, on the server; non-admins are redirected before any admin data loads.
  const admin = await requireAdmin("/admin");
  const overview = await getAdminOverview({ id: admin.id, role: admin.role });

  return (
    <>
      <AdminHeader
        title={`Welcome, ${admin.name}`}
        description="Live figures from the database. Select a figure to open the related list."
        actions={
          <>
            <ButtonLink href="/admin/programs/new">New program</ButtonLink>
            <ButtonLink href="/admin/submissions" variant="outline">
              Review submissions
            </ButtonLink>
          </>
        }
      />

      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="sr-only">
          Key figures
        </h2>
        <ul {...revealStagger} className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <Metric label="Published programs" value={overview.programs.published} href="/admin/programs?status=published" />
          <Metric label="Draft programs" value={overview.programs.draft} href="/admin/programs?status=draft" />
          <Metric label="Student accounts" value={overview.users.student} href="/admin/students" />
          <Metric label="Active enrolments" value={overview.activeEnrollments} href="/admin/enrollments?status=active" />
          <Metric label="Submissions to review" value={overview.pendingSubmissions} href="/admin/submissions" />
        </ul>
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="recent-programs-heading">
          <CardTitle as="h2" id="recent-programs-heading">
            Recently updated programs
          </CardTitle>
          {overview.recentPrograms.length === 0 ? (
            <p className="type-supporting mt-3 text-muted">
              No programs yet. <Link href="/admin/programs/new" className="font-semibold text-primary underline">Create the first one</Link>.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {overview.recentPrograms.map((program) => (
                <li key={program.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/admin/programs/${program.id}`} className="type-label wrap-anywhere text-primary underline-offset-4 hover:underline">
                      {program.title}
                    </Link>
                    <p className="type-meta mt-0.5 text-muted">Updated {formatDateTime(program.updatedAt)}</p>
                  </div>
                  <StatusBadge status={programStatusDisplay[program.status].status}>{programStatusDisplay[program.status].label}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card as="section" aria-labelledby="activity-heading">
          <CardTitle as="h2" id="activity-heading">
            Recent administrative activity
          </CardTitle>
          {overview.recentActivity.length === 0 ? (
            <p className="type-supporting mt-3 text-muted">No activity recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {overview.recentActivity.map((entry) => (
                <li key={entry.id} className="py-3">
                  <p className="type-label text-foreground">{auditActionLabel(entry.action)}</p>
                  <p className="type-meta mt-0.5 wrap-anywhere text-muted">
                    {entry.actor} · {formatDateTime(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/audit-logs"
            className="group type-button mt-4 inline-flex items-center gap-1.5 rounded-control text-primary transition-colors hover:text-primary-strong"
          >
            View the full audit log
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Card>
      </div>
    </>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Overview />
    </Suspense>
  );
}

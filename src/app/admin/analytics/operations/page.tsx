import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/learning/labels";
import { getOperationalStatus, type Health } from "@/lib/services/operations-service";

export const metadata: Metadata = { title: "Operations · Admin", robots: { index: false } };

const HEALTH: Record<Health, { label: string; status: Status }> = {
  healthy: { label: "Healthy", status: "success" },
  degraded: { label: "Degraded", status: "warning" },
  unavailable: { label: "Unavailable", status: "error" },
  not_configured: { label: "Not configured", status: "neutral" },
  unknown: { label: "Unknown", status: "neutral" },
};
const LINKS: Record<string, { href: string; label: string }> = {
  email: { href: "/admin/notifications", label: "Open email queue" },
  payments: { href: "/admin/payments?status=attention", label: "Open payments needing attention" },
  certificates: { href: "/admin/certificates", label: "Open certificates" },
};

async function Operations() {
  const admin = await requireAdmin("/admin/analytics/operations");
  const status = await getOperationalStatus({ id: admin.id, role: admin.role });

  return (
    <>
      <AdminHeader
        title="Operations"
        description={`Checked on the server at ${formatDateTime(status.checkedAt)}. Third-party services are not contacted and nothing is sent; only this platform's side is checked. Reload to check again.`}
      />
      <ul className="grid gap-4 md:grid-cols-2">
        {status.indicators.map((indicator) => {
          const health = HEALTH[indicator.status];
          const link = LINKS[indicator.key];
          return (
            <li key={indicator.key} className="rounded-card border border-border bg-background p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="type-card-title text-foreground">{indicator.label}</h2>
                <StatusBadge status={health.status}>{health.label}</StatusBadge>
              </div>
              <p className="type-supporting mt-2 text-foreground">{indicator.summary}</p>
              {indicator.facts.length > 0 && (
                <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 type-supporting">
                  {indicator.facts.map((fact) => (
                    <div key={fact.label} className="contents">
                      <dt className="text-muted">{fact.label}</dt>
                      <dd className="text-right tabular-nums text-foreground">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {link && (
                <Link href={link.href} className="type-supporting mt-3 inline-block font-semibold text-primary underline-offset-4 hover:underline">
                  {link.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function OperationsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Operations />
    </Suspense>
  );
}

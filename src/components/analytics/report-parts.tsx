import type { ReactNode } from "react";
import { revealStagger } from "@/lib/reveal";
import { cn } from "@/lib/utils";

/* Presentational pieces for the analytics pages (server components). */

/** Stat tile: label, value (proportional figures) and what it covers ("now" vs the period). */
export function Stat({ label, value, scope, note }: { label: string; value: ReactNode; scope: "now" | "period" | "lifetime"; note?: string }) {
  return (
    <div className="rounded-card border border-border bg-background p-4 shadow-card transition-[border-color,box-shadow] hover:border-border-strong/50 hover:shadow-hover">
      <dt className="type-supporting text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</dd>
      <dd className="type-meta mt-1 text-muted">
        {scope === "now" ? "Current" : scope === "lifetime" ? "All time" : "In selected period"}
        {note ? ` · ${note}` : ""}
      </dd>
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl {...revealStagger} className={cn("grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4", className)}>
      {children}
    </dl>
  );
}

export function Section({ id, title, description, children, actions }: { id: string; title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="type-section-title text-foreground">
            {title}
          </h2>
          {description && <p className="type-supporting mt-1 max-w-3xl text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Horizontal bars for magnitude by category; value at the bar tip (one colour, no legend). */
export function BarList({ rows, caption }: { rows: { key: string; label: string; value: number; display: string }[]; caption: string }) {
  if (rows.length === 0) return <p className="type-supporting text-muted">No data in this period.</p>;
  const max = Math.max(...rows.map((row) => row.value), 0);
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.key} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center sm:gap-3">
            <span className="type-supporting wrap-anywhere text-foreground">{row.label}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-3 origin-left animate-grow-x rounded-r-sm bg-primary"
                style={{
                  width: `${max > 0 ? Math.max((row.value / max) * 85, row.value > 0 ? 1 : 0) : 0}%`,
                  animationDelay: `${Math.min(index, 10) * 40}ms`,
                }}
                aria-hidden="true"
              />
              <span className="shrink-0 type-supporting tabular-nums text-foreground">{row.display}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function Unavailable({ children }: { children: ReactNode }) {
  return <span className="type-supporting font-normal text-muted">{children}</span>;
}

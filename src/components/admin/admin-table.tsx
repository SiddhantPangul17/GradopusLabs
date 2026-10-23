import type { ReactNode } from "react";

/**
 * An accessible data table that scrolls horizontally inside its own container
 * on small screens (the page itself never overflows).
 */
export function AdminTable({ caption, head, children }: { caption: string; head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-background shadow-card" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[40rem] border-collapse text-left type-supporting">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface">
          <tr>
            {head.map((label) => (
              <th key={label} scope="col" className="px-4 py-3 type-meta font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border [&>tr]:transition-colors [&>tr:hover]:bg-surface">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top text-foreground ${className ?? ""}`}>{children}</td>;
}

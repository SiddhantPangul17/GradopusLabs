import { cn } from "@/lib/utils";

export type Fact = { label: string; value: string };

type FactListProps = {
  items: readonly Fact[];
  className?: string;
};

/** Compact label/value pairs (a <dl>) that wrap to fit the available width. */
export function FactList({ items, className }: FactListProps) {
  return (
    <dl className={cn("grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-x-4 gap-y-3", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="type-meta text-muted">{item.label}</dt>
          {/* wrap-anywhere: long unbroken values such as email addresses must not overflow narrow cards. */}
          <dd className="type-label mt-0.5 wrap-anywhere text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

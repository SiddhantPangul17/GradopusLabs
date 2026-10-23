import type { ReactNode } from "react";
import { InfoIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description: ReactNode;
  /** Usually a ButtonLink offering a next step. */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex animate-fade-in flex-col items-center rounded-card border border-dashed border-border-strong/60 bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground ring-8 ring-secondary/40">
        <InfoIcon className="size-6" />
      </span>
      <p className="type-card-title mt-4 text-foreground">{title}</p>
      <div className="type-supporting mt-2 max-w-md text-muted">{description}</div>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

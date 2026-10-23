import { cn } from "@/lib/utils";

/** A placeholder block shown while content loads. Decorative: pair it with a role="status" message. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-control bg-foreground/6", className)} />;
}

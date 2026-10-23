import { cn } from "@/lib/utils";

/**
 * Shared look for underline tab strips (admin, student and analytics
 * navigation). The indicator grows from the centre on hover and stays in the
 * brand colour for the current page, which is also marked with aria-current.
 */
export function tabLinkStyles(active: boolean, className?: string) {
  return cn(
    "relative inline-flex items-center gap-1.5 rounded-t-control px-3 type-button transition-colors",
    "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-[scale,background-color] after:duration-300 after:ease-out-soft",
    active
      ? "text-primary after:scale-x-100 after:bg-primary"
      : "text-muted after:scale-x-0 after:bg-border-strong hover:bg-foreground/3 hover:text-foreground hover:after:scale-x-100",
    className,
  );
}

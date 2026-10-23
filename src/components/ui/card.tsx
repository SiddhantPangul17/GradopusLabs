import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardProps = {
  /** Use "li" inside lists and "article" for self-contained items. */
  as?: "div" | "article" | "section" | "li";
  /** Adds a restrained resting shadow. */
  elevated?: boolean;
  /** Lifts slightly on hover/focus-within; use for cards that lead somewhere. */
  interactive?: boolean;
  id?: string;
  "aria-labelledby"?: string;
  className?: string;
  children: ReactNode;
};

export function Card({ as: Component = "div", elevated = false, interactive = false, className, children, ...rest }: CardProps) {
  return (
    <Component
      {...rest}
      className={cn(
        "flex flex-col rounded-card border border-border bg-background p-5 sm:p-6",
        elevated && "shadow-card",
        interactive &&
          "transition-[border-color,box-shadow,translate] duration-300 ease-out-soft hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-hover focus-within:border-primary/25",
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-1.5", className)}>{children}</div>;
}

type CardTitleProps = {
  /** Choose the level that fits the page's heading hierarchy. */
  as?: "h2" | "h3" | "h4";
  id?: string;
  className?: string;
  children: ReactNode;
};

export function CardTitle({ as: Heading = "h3", id, className, children }: CardTitleProps) {
  return (
    <Heading id={id} className={cn("type-card-title text-foreground", className)}>
      {children}
    </Heading>
  );
}

export function CardDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("type-supporting text-muted", className)}>{children}</p>;
}

/** Sits at the bottom of the card, so cards in a grid keep aligned footers. */
export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="mt-auto pt-5">
      <div className={cn("flex flex-wrap items-center gap-3 border-t border-border pt-4", className)}>{children}</div>
    </div>
  );
}

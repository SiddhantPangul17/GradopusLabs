import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageContainerProps = {
  /** "page" for general layouts; "narrow" for long-form reading (policies, articles). */
  size?: "page" | "narrow";
  className?: string;
  children: ReactNode;
};

/** Centres content with the standard max width and responsive side padding. */
export function PageContainer({ size = "page", className, children }: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        size === "page" ? "max-w-page" : "max-w-narrow",
        className,
      )}
    >
      {children}
    </div>
  );
}

type PageSectionProps = {
  /** id of the section's heading, for an accessible landmark name. */
  labelledBy?: string;
  /** "muted" uses the secondary background to separate adjacent sections. */
  tone?: "default" | "muted";
  size?: PageContainerProps["size"];
  className?: string;
  children: ReactNode;
};

/** A full-width page section with the standard vertical rhythm and a PageContainer. */
export function PageSection({ labelledBy, tone = "default", size, className, children }: PageSectionProps) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn("py-12 sm:py-16 lg:py-20", tone === "muted" && "bg-surface", className)}
    >
      <PageContainer size={size}>{children}</PageContainer>
    </section>
  );
}

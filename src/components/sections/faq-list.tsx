import Link from "next/link";
import { ArrowRightIcon, ChevronDownIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { reveal } from "@/lib/reveal";
import { cn } from "@/lib/utils";
import type { FaqEntry } from "@/types";

/**
 * One question, using native <details>/<summary>: keyboard accessible (Enter /
 * Space), announced as expandable by screen readers, and works without JavaScript.
 */
export function FaqItem({ faq }: { faq: FaqEntry }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-control px-5 py-4 text-base font-semibold text-foreground transition-colors hover:bg-foreground/3 [&::-webkit-details-marker]:hidden">
        <span>{faq.question}</span>
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-muted transition-[background-color,color] group-open:bg-secondary group-open:text-secondary-foreground">
          <ChevronDownIcon className="size-4 transition-transform duration-300 ease-out-soft group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-3 px-5 pb-5 type-body text-muted group-open:animate-fade-up-sm">
        {faq.draft && <StatusBadge status="warning">Draft answer: policy not finalised</StatusBadge>}
        {faq.answer.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {faq.link && (
          <Link
            href={faq.link.href}
            className="group/link inline-flex items-center gap-1.5 rounded-control type-button text-primary transition-colors hover:text-primary-strong"
          >
            {faq.link.label}
            <ArrowRightIcon className="size-4 transition-transform group-hover/link:translate-x-0.5" />
          </Link>
        )}
      </div>
    </details>
  );
}

export function FaqList({ items, className }: { items: readonly FaqEntry[]; className?: string }) {
  return (
    <div {...reveal} className={cn("divide-y divide-border overflow-hidden rounded-card border border-border bg-background shadow-card", className)}>
      {items.map((faq) => (
        <FaqItem key={faq.id} faq={faq} />
      ))}
    </div>
  );
}

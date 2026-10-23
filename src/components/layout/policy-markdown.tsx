import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import { parsePlaceholder, resolvePolicyHref } from "@/lib/policies/markdown";

/*
 * Renders policy Markdown (docs/policies/*.md). Same safety settings as
 * LearningMarkdown: no raw HTML, no images, unsafe link protocols dropped.
 * Links between policy files become site links, and `[TO BE CONFIRMED: …]`
 * markers are shown as clearly labelled notes rather than as facts.
 */

const components: Components = {
  a({ href, children }) {
    const policyHref = typeof href === "string" ? resolvePolicyHref(href) : null;
    if (policyHref) return <Link href={policyHref}>{children}</Link>;
    const external = typeof href === "string" && /^https?:\/\//i.test(href);
    return (
      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
        {children}
        {external && <span className="sr-only"> (opens in a new tab)</span>}
      </a>
    );
  },
  code({ children }) {
    const placeholder = parsePlaceholder(String(children));
    if (placeholder !== null) {
      return (
        <span className="box-decoration-clone rounded-control bg-warning/10 px-1.5 py-0.5 text-foreground ring-1 ring-inset ring-warning/40">
          <strong className="font-semibold">To be confirmed</strong>
          {placeholder && `: ${placeholder}`}
        </span>
      );
    }
    return <code className="rounded-control bg-surface px-1 py-0.5 text-[0.9em]">{children}</code>;
  },
};

export function PolicyMarkdown({ children }: { children: string }) {
  return (
    <div className="prose-content">
      <Markdown components={components} disallowedElements={["img"]} unwrapDisallowed skipHtml>
        {children}
      </Markdown>
    </div>
  );
}

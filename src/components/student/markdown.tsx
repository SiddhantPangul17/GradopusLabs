import Markdown, { type Components } from "react-markdown";

/*
 * Renders learning content written in Markdown.
 *
 * Safety: react-markdown does NOT render raw HTML (it is shown as text) and
 * its default URL transform drops javascript:, data: and other unsafe link
 * protocols. Images are disabled until content images are served from our own
 * storage (external images could be used for tracking). External links open
 * in a new tab without passing a referrer or window access.
 */

const components: Components = {
  a({ href, children }) {
    const external = typeof href === "string" && /^https?:\/\//i.test(href);
    return (
      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
        {children}
        {external && <span className="sr-only"> (opens in a new tab)</span>}
      </a>
    );
  },
  // Keep the page's heading outline: content headings start below the page title.
  h1: ({ children }) => <h2>{children}</h2>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  pre: ({ children }) => <pre className="overflow-x-auto rounded-control bg-surface p-4 text-sm">{children}</pre>,
};

export function LearningMarkdown({ children }: { children: string }) {
  return (
    <div className="prose-content">
      <Markdown components={components} disallowedElements={["img"]} unwrapDisallowed skipHtml>
        {children}
      </Markdown>
    </div>
  );
}

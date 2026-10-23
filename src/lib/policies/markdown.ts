import { policies } from "@/config/policies";

/*
 * Turns a policy Markdown file (docs/policies/*.md) into what the website
 * shows. Pure functions, no I/O, so they are unit-tested directly.
 *
 * Document conventions (see the existing files):
 * - `# Title`, then intro lines, then `## N. Section title` sections and an
 *   unnumbered `## Revision history`.
 * - `## Notes for reviewers ...` and everything after it is internal.
 * - `[LEGAL REVIEW: …]` markers are internal and always stand as their own
 *   paragraph, written as inline code.
 * - `[TO BE CONFIRMED: …]` markers are shown publicly as "To be confirmed".
 * - Links between policies are relative: `./privacy-policy.md`.
 */

export type PolicySectionSource = {
  id: string;
  /** "3" for "## 3. Title"; null for unnumbered sections such as the revision history. */
  number: string | null;
  title: string;
  body: string;
};

export type ParsedPolicy = {
  title: string;
  intro: string;
  sections: PolicySectionSource[];
};

const REVIEWER_NOTES = /^## Notes for reviewers\b[\s\S]*$/m;
const LEGAL_REVIEW_PARAGRAPH = /^`\[LEGAL REVIEW:[^`]*\]`$/;
const PLACEHOLDER = /^\[TO BE CONFIRMED(?::\s*([\s\S]*?))?\]$/;
const POLICY_LINK = /^\.\/([a-z0-9-]+)\.md(#[a-z0-9-]+)?$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parsePolicyDocument(source: string): ParsedPolicy {
  const text = source.replace(/\r\n/g, "\n").replace(REVIEWER_NOTES, "");
  const publicText = text
    .split(/\n{2,}/)
    .filter((block) => !LEGAL_REVIEW_PARAGRAPH.test(block.replace(/\s+/g, " ").trim()))
    .join("\n\n");

  const [head, ...parts] = publicText.split(/^## /m);
  const title = head.match(/^# (.+)$/m)?.[1]?.trim();
  if (!title) throw new Error("Policy document has no '# Title' line.");

  const usedIds = new Set<string>();
  const sections = parts.map((part) => {
    const newline = part.indexOf("\n");
    const heading = (newline === -1 ? part : part.slice(0, newline)).trim();
    const body = newline === -1 ? "" : part.slice(newline + 1).trim();
    const numbered = heading.match(/^(\d+)\.\s+(.+)$/);
    const sectionTitle = numbered ? numbered[2] : heading;

    let id = slugify(sectionTitle);
    for (let n = 2; usedIds.has(id); n++) id = `${slugify(sectionTitle)}-${n}`;
    usedIds.add(id);

    return { id, number: numbered ? numbered[1] : null, title: sectionTitle, body };
  });

  return { title, intro: head.replace(/^# .+$/m, "").trim(), sections };
}

/** For inline code like `[TO BE CONFIRMED: detail]`: the detail ("" if none), or null if it isn't a placeholder. */
export function parsePlaceholder(code: string): string | null {
  const match = code.trim().match(PLACEHOLDER);
  if (!match) return null;
  return (match[1] ?? "").replace(/\s+/g, " ").trim();
}

/** Maps a link between policy files (`./privacy-policy.md#section`) to its website route, or null. */
export function resolvePolicyHref(href: string): string | null {
  const match = href.match(POLICY_LINK);
  if (!match) return null;
  const policy = policies.find((entry) => entry.slug === match[1]);
  return policy ? `${policy.href}${match[2] ?? ""}` : null;
}

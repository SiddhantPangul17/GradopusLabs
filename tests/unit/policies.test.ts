import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { policies } from "@/config/policies";
import { parsePlaceholder, parsePolicyDocument, resolvePolicyHref } from "@/lib/policies/markdown";

const POLICY_DIRECTORY = path.join(process.cwd(), "docs", "policies");
const readPolicy = (slug: string) => readFileSync(path.join(POLICY_DIRECTORY, `${slug}.md`), "utf8");

describe("parsePolicyDocument", () => {
  const source = [
    "# Example Policy",
    "",
    "- **Version:** 1.0",
    "",
    "## 1. First & foremost",
    "",
    "Visible text with `[TO BE CONFIRMED: an email]`.",
    "",
    "`[LEGAL REVIEW: internal note that spans",
    "two lines.]`",
    "",
    "### 1.1 Detail",
    "",
    "More text.",
    "",
    "## Revision history",
    "",
    "- **Version 1.0**",
    "",
    "## Notes for reviewers (remove before publication)",
    "",
    "Secret reviewer notes.",
  ].join("\r\n");

  it("splits the title, intro and numbered sections", () => {
    const parsed = parsePolicyDocument(source);
    expect(parsed.title).toBe("Example Policy");
    expect(parsed.intro).toBe("- **Version:** 1.0");
    expect(parsed.sections.map(({ id, number, title }) => ({ id, number, title }))).toEqual([
      { id: "first-and-foremost", number: "1", title: "First & foremost" },
      { id: "revision-history", number: null, title: "Revision history" },
    ]);
    expect(parsed.sections[0].body).toContain("### 1.1 Detail");
  });

  it("drops reviewer notes and legal-review paragraphs but keeps placeholders", () => {
    const text = JSON.stringify(parsePolicyDocument(source));
    expect(text).not.toContain("Notes for reviewers");
    expect(text).not.toContain("Secret reviewer notes");
    expect(text).not.toContain("LEGAL REVIEW");
    expect(text).toContain("[TO BE CONFIRMED: an email]");
  });

  it("rejects a document without a title", () => {
    expect(() => parsePolicyDocument("## 1. Section\n\nText")).toThrow();
  });
});

describe("placeholders and links", () => {
  it("parses placeholders", () => {
    expect(parsePlaceholder("[TO BE CONFIRMED]")).toBe("");
    expect(parsePlaceholder("[TO BE CONFIRMED: who decides\n  appeals]")).toBe("who decides appeals");
    expect(parsePlaceholder("https://")).toBeNull();
    expect(parsePlaceholder("[LEGAL REVIEW: x]")).toBeNull();
  });

  it("maps links between policy files to site routes", () => {
    expect(resolvePolicyHref("./privacy-policy.md")).toBe("/privacy");
    expect(resolvePolicyHref("./terms-and-conditions.md#fees")).toBe("/terms#fees");
    expect(resolvePolicyHref("./unknown.md")).toBeNull();
    expect(resolvePolicyHref("https://example.com/a.md")).toBeNull();
  });
});

describe("published policy documents", () => {
  it("has unique routes and slugs", () => {
    expect(new Set(policies.map((policy) => policy.href)).size).toBe(policies.length);
    expect(new Set(policies.map((policy) => policy.slug)).size).toBe(policies.length);
  });

  it.each(policies.map((policy) => [policy.slug]))("%s renders safely and completely", (slug) => {
    const parsed = parsePolicyDocument(readPolicy(slug));
    const published = JSON.stringify(parsed);

    expect(published).not.toContain("LEGAL REVIEW");
    expect(published).not.toContain("Notes for reviewers");
    expect(published).not.toContain("TO BE CONFIRMED"); // the policies are in effect: no open placeholders
    expect(published).not.toMatch(/^\|/m); // tables are not supported by the renderer
    expect(parsed.intro).toMatch(/\*\*Effective date:\*\* \d{1,2} [A-Z][a-z]+ \d{4}/);
    expect(parsed.intro).toMatch(/\*\*Version:\*\*/);

    const numbers = parsed.sections.filter((section) => section.number !== null).map((section) => Number(section.number));
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    expect(parsed.sections.at(-1)?.title).toBe("Revision history");

    for (const [, href] of published.matchAll(/\]\((\.\/[^)]+)\)/g)) {
      expect(resolvePolicyHref(href), `${slug}: ${href}`).not.toBeNull();
    }
  });
});

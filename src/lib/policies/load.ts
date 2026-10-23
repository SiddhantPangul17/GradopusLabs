import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import type { PolicySlug } from "@/config/policies";
import { parsePolicyDocument, type ParsedPolicy } from "@/lib/policies/markdown";

/** Directory holding the policy Markdown files (included in the server bundle via next.config.ts). */
export const POLICY_DIRECTORY = path.join(process.cwd(), "docs", "policies");

/**
 * Reads and parses a published policy. Cached for as long as possible: the
 * files only change with a deployment, so the pages are prerendered at build.
 */
export async function loadPolicy(slug: PolicySlug): Promise<ParsedPolicy> {
  "use cache";
  cacheLife("max");
  const source = await readFile(path.join(POLICY_DIRECTORY, `${slug}.md`), "utf8");
  return parsePolicyDocument(source);
}

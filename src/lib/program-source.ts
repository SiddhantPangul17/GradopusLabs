import "server-only";
import { programFixtures } from "@/data/programs";
import { isDatabaseConfigured } from "@/lib/db/mongodb";
import { findPublishedProgramSlugs } from "@/lib/services/program-service";
import { isValidSlug } from "@/lib/validation/common";

/**
 * Where public program data comes from:
 * - "database": MONGODB_URI is set; only published programs are shown.
 * - "fixtures": development only (`next dev`) without a database; sample data,
 *   always labelled as such on the page.
 * - "unconfigured": production without a database; the catalogue is empty and
 *   an error is logged. Fixtures are never used in production.
 */
export type ProgramDataSource = "database" | "fixtures" | "unconfigured";

export function getProgramDataSource(): ProgramDataSource {
  if (isDatabaseConfigured()) return "database";
  return process.env.NODE_ENV === "development" ? "fixtures" : "unconfigured";
}

let reportedUnconfigured = false;

export function reportUnconfiguredProgramSource(): void {
  if (reportedUnconfigured) return;
  reportedUnconfigured = true;
  console.error(
    "[programs] MONGODB_URI is not set, so no programs can be listed. Configure the database (docs/database-setup.md).",
  );
}

// Short-lived slug list for Proxy, so it does not query the database on every request.
const SLUG_CACHE_TTL_MS = 60_000;
let slugCache: { slugs: Set<string>; expiresAt: number } | null = null;

/**
 * Fast existence check used by src/proxy.ts to return a real 404 for unknown
 * program URLs before rendering. A newly published program may take up to a
 * minute to be recognised here. On database errors it returns true so the
 * page itself decides (it still renders a not-found page if needed).
 */
export async function isKnownProgramSlug(slug: string): Promise<boolean> {
  if (!isValidSlug(slug)) return false;

  switch (getProgramDataSource()) {
    case "fixtures":
      return programFixtures.some((program) => program.slug === slug);
    case "unconfigured":
      return false;
    case "database":
      try {
        if (!slugCache || slugCache.expiresAt < Date.now()) {
          slugCache = { slugs: new Set(await findPublishedProgramSlugs()), expiresAt: Date.now() + SLUG_CACHE_TTL_MS };
        }
        return slugCache.slugs.has(slug);
      } catch {
        return true;
      }
  }
}

import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { programFixtures } from "@/data/programs";
import { getProgramDataSource, reportUnconfiguredProgramSource } from "@/lib/program-source";
import {
  findPublishedProgramBySlug,
  findPublishedPrograms,
  PROGRAMS_CACHE_TAG,
} from "@/lib/services/program-service";
import { isValidSlug } from "@/lib/validation/common";
import type { Program } from "@/types";

/*
 * Public program data access: the only module pages use to read programs.
 *
 * Results are cached ("use cache") and tagged, so pages stay static and are
 * refreshed hourly or when program-service calls revalidateTag("programs")
 * after a change. Only published programs are ever returned; see
 * getProgramDataSource() for how fixtures are restricted to development.
 */

export { getProgramDataSource } from "@/lib/program-source";

/** Published programs in display order. */
export async function getPrograms(): Promise<readonly Program[]> {
  "use cache";
  cacheTag(PROGRAMS_CACHE_TAG);
  cacheLife("hours");

  switch (getProgramDataSource()) {
    case "database":
      return findPublishedPrograms();
    case "fixtures":
      return programFixtures;
    case "unconfigured":
      reportUnconfiguredProgramSource();
      return [];
  }
}

export async function getFeaturedPrograms(limit = 3): Promise<readonly Program[]> {
  const programs = await getPrograms();
  return programs.filter((program) => program.featured).slice(0, limit);
}

let lastFailureReport = 0;

/**
 * For listing pages: programs, or `unavailable` when they cannot be loaded
 * (e.g. the database is unreachable), so the page can say so instead of
 * failing. The error is caught OUTSIDE the cached function, so a temporary
 * failure is never cached as an empty catalogue.
 */
export async function loadPrograms(options: { featured?: number } = {}): Promise<{ programs: readonly Program[]; unavailable: boolean }> {
  try {
    const programs = options.featured ? await getFeaturedPrograms(options.featured) : await getPrograms();
    return { programs, unavailable: false };
  } catch (error) {
    // performance.now(), not Date.now(): this can run while a page is being prerendered.
    if (lastFailureReport === 0 || performance.now() - lastFailureReport > 60_000) {
      lastFailureReport = performance.now();
      console.error(`[programs] Programs could not be loaded (${error instanceof Error ? error.name : "unknown error"}).`);
    }
    return { programs: [], unavailable: true };
  }
}

/** A published program, or null for unknown, draft or archived slugs. */
export async function getProgramBySlug(slug: string): Promise<Program | null> {
  "use cache";
  cacheTag(PROGRAMS_CACHE_TAG);
  cacheLife("hours");

  if (!isValidSlug(slug)) return null;

  switch (getProgramDataSource()) {
    case "database":
      return findPublishedProgramBySlug(slug);
    case "fixtures":
      return programFixtures.find((program) => program.slug === slug) ?? null;
    case "unconfigured":
      reportUnconfiguredProgramSource();
      return null;
  }
}

export async function getProgramSlugs(): Promise<readonly string[]> {
  const { programs } = await loadPrograms();
  return programs.map((program) => program.slug);
}

import { vi } from "vitest";

/** A complete, valid program input for tests. */
export function programInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Test Program",
    slug: "test-program",
    shortDescription: "A short summary.",
    description: "First paragraph.\n\nSecond paragraph.",
    category: "Testing",
    difficulty: "beginner" as const,
    duration: { weeks: 4, weeklyEffort: "4 hours per week" },
    deliveryFormat: "Online",
    price: 9900,
    learningOutcomes: ["Outcome"],
    prerequisites: ["None"],
    modules: [{ title: "Module", topics: ["Topic"] }],
    completionCriteria: ["Submit all tasks."],
    ...overrides,
  };
}

/**
 * Re-imports app modules with a fresh environment. src/lib/env.ts caches the
 * parsed environment and mongodb.ts caches the connection on globalThis, so
 * both are reset here.
 */
export async function freshModules(env: Record<string, string | undefined>) {
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  delete (globalThis as { __krushitechMongoose?: unknown }).__krushitechMongoose;
  vi.resetModules();
}

import type { z } from "zod";

/*
 * Rules for importing a whole program (details, modules and tasks) from JSON
 * in the admin dashboard. Pure functions (unit-tested); the package schema in
 * src/lib/validation/curriculum.ts remains the authoritative validation.
 */

/** Largest JSON accepted from the import form, in characters (Server Actions accept up to 1 MB). */
export const MAX_IMPORT_CHARS = 900_000;

/** How many validation problems are listed back to the administrator at once. */
const MAX_LISTED_ISSUES = 12;

/** Parses pasted JSON, or explains why it cannot be read. */
export function parsePackageJson(text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return { ok: false, message: "Paste the program JSON, or choose a .json file." };
  if (trimmed.length > MAX_IMPORT_CHARS) {
    return { ok: false, message: `The JSON is too large: the limit is ${MAX_IMPORT_CHARS.toLocaleString("en-IN")} characters.` };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "it could not be read";
    return { ok: false, message: `This is not valid JSON (${reason}). Copy the whole file, from the first { to the last }.` };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Imported programs are always drafts, whatever the file says: publishing
 * goes through the confirmed status change and its checklist.
 */
export function asDraftPackage(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.program)) return value;
  return { ...value, program: { ...value.program, status: "draft" } };
}

/** Titles of tasks that ask for file uploads, which are refused until secure storage exists. */
export function fileTaskTitles(pkg: { modules: readonly { tasks: readonly { title: string; taskType: string }[] }[] }): string[] {
  return pkg.modules.flatMap((module) => module.tasks.filter((task) => task.taskType === "file").map((task) => task.title));
}

/** "Module 3, task 1, slug" instead of "modules.2.tasks.0.slug". */
function describePath(path: readonly PropertyKey[]): string {
  const parts: string[] = [];
  let rest = path;
  if (path[0] === "program") {
    parts.push("Program details");
    rest = path.slice(1);
  } else if (path[0] === "modules" && typeof path[1] === "number") {
    parts.push(`Module ${path[1] + 1}`);
    rest = path.slice(2);
    if (rest[0] === "tasks" && typeof rest[1] === "number") {
      parts.push(`task ${rest[1] + 1}`);
      rest = rest.slice(2);
    }
  }
  parts.push(...rest.map((key) => (typeof key === "number" ? `item ${key + 1}` : String(key))));
  return parts.length > 0 ? parts.join(", ") : "The file";
}

/** Readable validation problems, at most MAX_LISTED_ISSUES of them. */
export function describeImportIssues(error: z.ZodError): string[] {
  const listed = error.issues.slice(0, MAX_LISTED_ISSUES).map((issue) => `${describePath(issue.path)}: ${issue.message}`);
  const more = error.issues.length - listed.length;
  return more > 0 ? [...listed, `…and ${more} more.`] : listed;
}

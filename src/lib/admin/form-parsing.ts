import type { z } from "zod";
import { SLUG_MAX_LENGTH } from "@/lib/constants";

/*
 * Conversions between admin form fields and stored values. Pure functions
 * (unit-tested); the Zod schemas remain the authoritative validation.
 */

/** One item per non-empty line. */
export function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Lowercase words joined by single hyphens; e.g. "Web Dev 101!" -> "web-dev-101". */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

/**
 * Rupees typed by an admin ("99", "1,499", "99.5", "99.50") to integer paise,
 * using string/integer arithmetic only (never floating point). Null if invalid.
 */
export function rupeesToPaise(value: string): number | null {
  const cleaned = value.trim().replace(/,/g, "").replace(/^₹\s*/, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const rupees = Number.parseInt(match[1]!, 10);
  const paise = Number.parseInt((match[2] ?? "").padEnd(2, "0") || "0", 10);
  return rupees * 100 + paise;
}

/** Integer paise to an editable rupee string: 9900 -> "99", 9950 -> "99.50". */
export function paiseToRupees(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}

/** "Title: detail one; detail two" per line -> [{ title, items }]. */
export function parseTitledLines(value: string): { title: string; detail: string }[] {
  return lines(value).map((line) => {
    const index = line.indexOf(":");
    return index === -1
      ? { title: line, detail: "" }
      : { title: line.slice(0, index).trim(), detail: line.slice(index + 1).trim() };
  });
}

/** A whole-number field, or NaN (which the schema then rejects with a clear message). */
export function intField(value: string): number {
  return /^-?\d+$/.test(value.trim()) ? Number.parseInt(value.trim(), 10) : Number.NaN;
}

/** India has no daylight saving time, so IST is always UTC+05:30. */
const IST_OFFSET = "+05:30";

/** <input type="datetime-local"> value (interpreted as IST) to an ISO string, "" -> undefined. */
export function istLocalToIso(value: string): string | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}:00${IST_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Date to a datetime-local value in IST. */
export function isoToIstLocal(date: Date | null | undefined): string {
  if (!date) return "";
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 16);
}

/**
 * Zod issues to { formField: message }, using `fieldMap` to translate schema
 * paths (e.g. "duration.weeks", "modules.2.title") to form field names.
 */
export function formFieldErrors(error: z.ZodError, fieldMap: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const fullPath = issue.path.map(String).join(".");
    const head = String(issue.path[0] ?? "form");
    const field = fieldMap[fullPath] ?? fieldMap[head] ?? head;
    const prefix = issue.path.length > 1 && /^\d+$/.test(String(issue.path[1])) ? `Line ${Number(issue.path[1]) + 1}: ` : "";
    result[field] ??= `${prefix}${issue.message}`;
  }
  return result;
}

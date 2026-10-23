import { z } from "zod";
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from "@/lib/constants";

/*
 * Shared validators. This module must stay free of server-only imports
 * (such as mongoose) so client-side forms can reuse the same rules.
 */

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

/** A 24-character hex MongoDB ObjectId string. */
export const objectIdSchema = z.string().regex(OBJECT_ID_PATTERN, "Invalid identifier.");

export function isValidObjectIdString(value: string): boolean {
  return OBJECT_ID_PATTERN.test(value);
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter a slug.")
  .max(SLUG_MAX_LENGTH)
  .regex(SLUG_PATTERN, "Use lowercase letters, digits and single hyphens, e.g. web-development-basics.");

export function isValidSlug(value: string): boolean {
  return value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

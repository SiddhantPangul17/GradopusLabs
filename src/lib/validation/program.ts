import { z } from "zod";
import { brand } from "@/config/brand";
import {
  CURRENCY_PATTERN,
  MAX_PRICE_MINOR_UNITS,
  PROGRAM_AVAILABILITY,
  PROGRAM_LEVELS,
  PROGRAM_STATUSES,
} from "@/lib/constants";
import { slugSchema } from "@/lib/validation/common";

const text = (max: number) => z.string().trim().min(1, "This field is required.").max(max);
const list = (maxItems: number, itemMax: number) => z.array(text(itemMax)).max(maxItems).default([]);

/**
 * Input for creating a program. Validates untrusted data before it reaches
 * Mongoose; `.strict()` rejects unknown fields (e.g. timestamps or ids).
 */
export const programInputSchema = z
  .object({
    title: text(120),
    slug: slugSchema,
    shortDescription: text(300),
    description: text(10_000),
    category: text(60),
    difficulty: z.enum(PROGRAM_LEVELS),
    duration: z.object({ weeks: z.number().int().min(1).max(104), weeklyEffort: text(60) }).strict(),
    deliveryFormat: text(200),
    price: z
      .number()
      .int("Price must be a whole number of paise (₹99 = 9900).")
      .min(0, "Price cannot be negative.")
      .max(MAX_PRICE_MINOR_UNITS),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(CURRENCY_PATTERN, "Use a 3-letter currency code, e.g. INR.")
      .default(brand.commerce.currency),
    learningOutcomes: list(20, 200),
    prerequisites: list(20, 200),
    audience: list(10, 200),
    modules: z.array(z.object({ title: text(120), topics: list(20, 120) }).strict()).max(30).default([]),
    tasks: z.array(z.object({ title: text(120), description: text(1_000) }).strict()).max(50).default([]),
    finalProject: z.string().trim().max(1_000).default(""),
    inclusions: list(15, 200),
    completionCriteria: list(15, 300),
    faqs: z.array(z.object({ question: text(200), answer: list(5, 1_000) }).strict()).max(20).default([]),
    status: z.enum(PROGRAM_STATUSES).default("draft"),
    availability: z.enum(PROGRAM_AVAILABILITY).default("coming-soon"),
    featured: z.boolean().default(false),
    displayOrder: z.number().int().min(-1_000).max(1_000).default(0),
  })
  .strict();

export type ProgramInput = z.infer<typeof programInputSchema>;

import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import { brand } from "@/config/brand";
import {
  CURRENCY_PATTERN,
  MAX_PRICE_MINOR_UNITS,
  PROGRAM_AVAILABILITY,
  PROGRAM_LEVELS,
  PROGRAM_STATUSES,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
  type ProgramStatus,
} from "@/lib/constants";
import type { ProgramAvailability, ProgramLevel } from "@/types";

/*
 * A training program. Field names follow the database spec; the public
 * `Program` shape used by the pages is produced by toProgram() in
 * src/lib/services/program-service.ts, so the UI does not depend on storage.
 */

export type ProgramModuleRecord = { title: string; topics: string[] };
export type ProgramTaskRecord = { title: string; description: string };
export type ProgramFaqRecord = { _id: Types.ObjectId; question: string; answer: string[] };

export type ProgramRecord = {
  title: string;
  slug: string;
  shortDescription: string;
  /** Long description; paragraphs separated by a blank line. */
  description: string;
  category: string;
  difficulty: ProgramLevel;
  duration: { weeks: number; weeklyEffort: string };
  deliveryFormat: string;
  /** Smallest currency unit (paise for INR): ₹99 is stored as 9900. */
  price: number;
  currency: string;
  learningOutcomes: string[];
  prerequisites: string[];
  audience: string[];
  modules: ProgramModuleRecord[];
  tasks: ProgramTaskRecord[];
  finalProject: string;
  inclusions: string[];
  completionCriteria: string[];
  faqs: ProgramFaqRecord[];
  /** Publication state: only "published" programs are visible to the public. */
  status: ProgramStatus;
  /** Enrolment state shown on published programs. */
  availability: ProgramAvailability;
  featured: boolean;
  /** Lower numbers are listed first. */
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

const maxItems = (limit: number) => ({
  validator: (value: unknown[]) => value.length <= limit,
  message: `A maximum of ${limit} items is allowed.`,
});

const trimmedString = (maxlength: number, required = true) => ({ type: String, trim: true, required, maxlength });

const stringList = (limit: number, itemMax: number) => ({
  type: [{ type: String, trim: true, maxlength: itemMax }],
  default: [],
  validate: maxItems(limit),
});

const programSchema = new Schema<ProgramRecord>(
  {
    title: trimmedString(120),
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: SLUG_MAX_LENGTH,
      match: [SLUG_PATTERN, "Slugs use lowercase letters, digits and single hyphens."],
      unique: true,
    },
    shortDescription: trimmedString(300),
    description: trimmedString(10_000),
    category: trimmedString(60),
    difficulty: { type: String, enum: PROGRAM_LEVELS, required: true },
    duration: {
      weeks: { type: Number, required: true, min: 1, max: 104, validate: Number.isInteger },
      weeklyEffort: trimmedString(60),
    },
    deliveryFormat: trimmedString(200),
    price: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_PRICE_MINOR_UNITS,
      validate: { validator: Number.isInteger, message: "Price must be a whole number of the smallest currency unit." },
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: CURRENCY_PATTERN,
      default: brand.commerce.currency,
    },
    learningOutcomes: stringList(20, 200),
    prerequisites: stringList(20, 200),
    audience: stringList(10, 200),
    modules: {
      type: [
        new Schema<ProgramModuleRecord>(
          { title: trimmedString(120), topics: stringList(20, 120) },
          { _id: false },
        ),
      ],
      default: [],
      validate: maxItems(30),
    },
    tasks: {
      type: [
        new Schema<ProgramTaskRecord>(
          { title: trimmedString(120), description: trimmedString(1_000) },
          { _id: false },
        ),
      ],
      default: [],
      validate: maxItems(50),
    },
    finalProject: trimmedString(1_000, false),
    inclusions: stringList(15, 200),
    completionCriteria: stringList(15, 300),
    faqs: {
      type: [new Schema({ question: trimmedString(200), answer: stringList(5, 1_000) })],
      default: [],
      validate: maxItems(20),
    },
    status: { type: String, enum: PROGRAM_STATUSES, required: true, default: "draft" },
    availability: { type: String, enum: PROGRAM_AVAILABILITY, required: true, default: "coming-soon" },
    featured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true, strict: "throw" },
);

// Public catalogue: filter by status, then sort. (slug already has a unique index.)
programSchema.index({ status: 1, displayOrder: 1, createdAt: 1 });

export const ProgramModel: Model<ProgramRecord> =
  (models.Program as Model<ProgramRecord> | undefined) ?? model<ProgramRecord>("Program", programSchema);

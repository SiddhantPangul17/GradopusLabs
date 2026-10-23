import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from "@/lib/constants";

/*
 * A unit of learning content inside a program. Modules have stable ObjectIds
 * (used in URLs, progress and submissions) and a per-program `slug` used by
 * content imports to update a module in place instead of recreating it.
 *
 * `content` is Markdown. It is rendered without raw HTML (see
 * src/components/student/markdown.tsx), so it can never inject scripts.
 * Unpublished modules are never shown to students.
 */

export type LearningModuleRecord = {
  programId: Types.ObjectId;
  slug: string;
  title: string;
  description: string;
  /** Position within the program; lower first. */
  order: number;
  content: string;
  estimatedDurationMinutes: number | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const learningModuleSchema = new Schema<LearningModuleRecord>(
  {
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: SLUG_MAX_LENGTH, match: SLUG_PATTERN },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 1_000, default: "" },
    order: { type: Number, required: true, min: 0, max: 10_000, validate: Number.isInteger },
    content: { type: String, maxlength: 50_000, default: "" },
    estimatedDurationMinutes: { type: Number, min: 1, max: 10_000, default: null },
    isPublished: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, strict: "throw", collection: "learning_modules" },
);

learningModuleSchema.index({ programId: 1, slug: 1 }, { unique: true });
// Students' view: published modules of a program in order.
learningModuleSchema.index({ programId: 1, isPublished: 1, order: 1 });

export const LearningModuleModel: Model<LearningModuleRecord> =
  (models.LearningModule as Model<LearningModuleRecord> | undefined) ??
  model<LearningModuleRecord>("LearningModule", learningModuleSchema);

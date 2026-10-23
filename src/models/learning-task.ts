import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
  TASK_COMPLETION_RULES,
  TASK_TYPES,
  type TaskCompletionRule,
  type TaskType,
} from "@/lib/constants";

/*
 * A task students complete inside a module. `required` tasks determine
 * module completion and certificate eligibility (src/lib/learning/progress.ts).
 * `instructions` is Markdown rendered without raw HTML. Unpublished tasks are
 * never shown to students and never count towards progress.
 */

export type LearningTaskRecord = {
  programId: Types.ObjectId;
  moduleId: Types.ObjectId;
  slug: string;
  title: string;
  description: string;
  instructions: string;
  order: number;
  taskType: TaskType;
  required: boolean;
  completionRule: TaskCompletionRule;
  dueDate: Date | null;
  /** File tasks only (uploads are not enabled yet). */
  allowedFileTypes: string[];
  maxFileSizeBytes: number | null;
  evaluationCriteria: string[];
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const learningTaskSchema = new Schema<LearningTaskRecord>(
  {
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    moduleId: { type: Schema.Types.ObjectId, ref: "LearningModule", required: true },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: SLUG_MAX_LENGTH, match: SLUG_PATTERN },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 1_000, default: "" },
    instructions: { type: String, maxlength: 20_000, default: "" },
    order: { type: Number, required: true, min: 0, max: 10_000, validate: Number.isInteger },
    taskType: { type: String, enum: TASK_TYPES, required: true },
    required: { type: Boolean, required: true, default: true },
    completionRule: { type: String, enum: TASK_COMPLETION_RULES, required: true, default: "review" },
    dueDate: { type: Date, default: null },
    allowedFileTypes: {
      type: [{ type: String, enum: ALLOWED_UPLOAD_EXTENSIONS }],
      default: [],
    },
    maxFileSizeBytes: { type: Number, min: 1, max: MAX_UPLOAD_BYTES, default: null },
    evaluationCriteria: {
      type: [{ type: String, trim: true, maxlength: 300 }],
      default: [],
      validate: { validator: (value: string[]) => value.length <= 20, message: "At most 20 criteria." },
    },
    isPublished: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, strict: "throw", collection: "learning_tasks" },
);

learningTaskSchema.index({ programId: 1, slug: 1 }, { unique: true });
// Students' view: published tasks of a module in order (and of a program, via programId).
learningTaskSchema.index({ moduleId: 1, isPublished: 1, order: 1 });
learningTaskSchema.index({ programId: 1, isPublished: 1 });

export const LearningTaskModel: Model<LearningTaskRecord> =
  (models.LearningTask as Model<LearningTaskRecord> | undefined) ??
  model<LearningTaskRecord>("LearningTask", learningTaskSchema);

import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";

/*
 * Per-enrollment learning progress.
 *
 * Progress is DERIVED: src/lib/learning/progress.ts calculates it from the
 * published curriculum, the student's submissions and `readModules`. Pages
 * always recalculate it, so it can never drift from the source data.
 *
 * Stored here:
 * - `readModules`: the only non-derivable state, i.e. reading-only modules
 *   (no required tasks) that the student marked as done.
 * - `snapshot`: a cache of the last calculation, refreshed after every change,
 *   for future admin lists and reporting. Never treated as the source of truth.
 */

export type ProgressSnapshot = {
  completedModuleIds: Types.ObjectId[];
  completedTaskIds: Types.ObjectId[];
  totalModules: number;
  percent: number;
  state: string;
  computedAt: Date;
};

export type LearningProgressRecord = {
  studentId: Types.ObjectId;
  enrollmentId: Types.ObjectId;
  programId: Types.ObjectId;
  readModules: { moduleId: Types.ObjectId; completedAt: Date }[];
  snapshot: ProgressSnapshot | null;
  createdAt: Date;
  updatedAt: Date;
};

const learningProgressSchema = new Schema<LearningProgressRecord>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    readModules: {
      type: [
        new Schema(
          {
            moduleId: { type: Schema.Types.ObjectId, ref: "LearningModule", required: true },
            completedAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    snapshot: {
      type: new Schema<ProgressSnapshot>(
        {
          completedModuleIds: [{ type: Schema.Types.ObjectId }],
          completedTaskIds: [{ type: Schema.Types.ObjectId }],
          totalModules: { type: Number, required: true },
          percent: { type: Number, required: true, min: 0, max: 100 },
          state: { type: String, required: true },
          computedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true, strict: "throw", collection: "learning_progress" },
);

// Exactly one progress record per enrollment (an enrollment belongs to one student).
learningProgressSchema.index({ enrollmentId: 1 }, { unique: true });
learningProgressSchema.index({ studentId: 1 });
// Analytics: enrollments by cached progress state.
learningProgressSchema.index({ "snapshot.state": 1 });

export const LearningProgressModel: Model<LearningProgressRecord> =
  (models.LearningProgress as Model<LearningProgressRecord> | undefined) ??
  model<LearningProgressRecord>("LearningProgress", learningProgressSchema);

import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import {
  AVAILABLE_SUBMISSION_TYPES,
  MAX_SUBMISSION_ATTEMPTS,
  SUBMISSION_STATUSES,
  type SubmissionStatus,
  type SubmissionType,
} from "@/lib/constants";

/*
 * One attempt at a task. Attempts are append-only: a resubmission creates a
 * new document with the next `attempt` number, so history is never lost.
 * The unique (enrollmentId, taskId, attempt) index makes concurrent
 * double-submissions fail cleanly instead of creating duplicates.
 *
 * Students only ever create documents with status "submitted". Status,
 * feedback, score and reviewer fields are written only by the review service
 * (src/lib/services/submission-service.ts), which enforces allowed transitions.
 *
 * File submissions are not stored: there is no `fileReference` until a
 * private object storage provider is configured.
 */

export type SubmissionRecord = {
  studentId: Types.ObjectId;
  enrollmentId: Types.ObjectId;
  programId: Types.ObjectId;
  moduleId: Types.ObjectId;
  taskId: Types.ObjectId;
  attempt: number;
  submissionType: SubmissionType;
  textContent: string | null;
  projectUrl: string | null;
  status: SubmissionStatus;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewerId: Types.ObjectId | null;
  feedback: string | null;
  /** 0–100, set by a reviewer only. */
  score: number | null;
  createdAt: Date;
  updatedAt: Date;
};

const submissionSchema = new Schema<SubmissionRecord>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    moduleId: { type: Schema.Types.ObjectId, ref: "LearningModule", required: true },
    taskId: { type: Schema.Types.ObjectId, ref: "LearningTask", required: true },
    attempt: { type: Number, required: true, min: 1, max: MAX_SUBMISSION_ATTEMPTS, validate: Number.isInteger },
    submissionType: { type: String, enum: AVAILABLE_SUBMISSION_TYPES, required: true },
    textContent: { type: String, maxlength: 10_000, default: null },
    projectUrl: { type: String, maxlength: 2_048, match: /^https:\/\//, default: null },
    status: { type: String, enum: SUBMISSION_STATUSES, required: true, default: "submitted" },
    submittedAt: { type: Date, required: true },
    reviewedAt: { type: Date, default: null },
    reviewerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    feedback: { type: String, maxlength: 5_000, default: null },
    score: { type: Number, min: 0, max: 100, default: null },
  },
  { timestamps: true, strict: "throw", collection: "submissions" },
);

// The content field must match the submission type.
submissionSchema.pre("validate", function () {
  if (this.submissionType === "text" && (!this.textContent || this.projectUrl)) {
    this.invalidate("textContent", "Text submissions need text content and no URL.");
  }
  if (this.submissionType === "project_url" && !this.projectUrl) {
    this.invalidate("projectUrl", "Project URL submissions need a URL.");
  }
});

submissionSchema.index({ enrollmentId: 1, taskId: 1, attempt: 1 }, { unique: true });
// A student's history, newest first.
submissionSchema.index({ studentId: 1, submittedAt: -1 });
// Future review queue: oldest submitted first.
submissionSchema.index({ status: 1, submittedAt: 1 });
// Review-time reports: decisions by decision time.
submissionSchema.index({ reviewedAt: 1 }, { partialFilterExpression: { reviewedAt: { $type: "date" } } });
// Review queue filtered by program.
submissionSchema.index({ programId: 1, status: 1, submittedAt: 1 });

export const SubmissionModel: Model<SubmissionRecord> =
  (models.Submission as Model<SubmissionRecord> | undefined) ?? model<SubmissionRecord>("Submission", submissionSchema);

import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import { brand } from "@/config/brand";
import {
  CURRENCY_PATTERN,
  CURRENT_ENROLLMENT_STATUSES,
  ENROLLMENT_SOURCES,
  ENROLLMENT_STATUSES,
  MAX_PRICE_MINOR_UNITS,
  type EnrollmentSource,
  type EnrollmentStatus,
} from "@/lib/constants";

/*
 * A student's enrolment in a program.
 *
 * Paid enrolments are created only by the payment service after the provider
 * has confirmed the payment (signed webhook, or checkout signature plus an API
 * fetch), never because the browser reached a success page. No route accepts
 * an enrolment id to activate.
 */

export type EnrollmentRecord = {
  studentId: Types.ObjectId;
  programId: Types.ObjectId;
  status: EnrollmentStatus;
  /** Amount actually paid, in the smallest currency unit. Set by the server only. */
  amountPaid: number;
  currency: string;
  enrolledAt: Date | null;
  completedAt: Date | null;
  /** "manual" = created by an admin or operator script (no payment); "payment" = after a verified payment. */
  source: EnrollmentSource;
  /** The verified payment that created this enrolment (source "payment" only). */
  paymentId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

const enrollmentSchema = new Schema<EnrollmentRecord>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    status: { type: String, enum: ENROLLMENT_STATUSES, required: true, default: "pending" },
    amountPaid: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: MAX_PRICE_MINOR_UNITS,
      validate: { validator: Number.isInteger, message: "Amounts must be whole numbers of the smallest currency unit." },
    },
    currency: { type: String, required: true, uppercase: true, match: CURRENCY_PATTERN, default: brand.commerce.currency },
    enrolledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    source: { type: String, enum: ENROLLMENT_SOURCES, required: true, default: "manual" },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
  },
  { timestamps: true, strict: "throw" },
);

// At most one current (pending or active) enrolment per student and program,
// enforced by the database. Cancelled or completed enrolments do not block a
// new one. Partial indexes with $in require MongoDB 6.0+ (Atlas default).
enrollmentSchema.index(
  { studentId: 1, programId: 1 },
  {
    unique: true,
    name: "unique_current_enrollment",
    partialFilterExpression: { status: { $in: [...CURRENT_ENROLLMENT_STATUSES] } },
  },
);
// A payment activates at most one enrolment (makes activation safe to retry).
enrollmentSchema.index(
  { paymentId: 1 },
  { unique: true, name: "unique_enrollment_payment", partialFilterExpression: { paymentId: { $type: "objectId" } } },
);
// A student's enrolments, newest first.
enrollmentSchema.index({ studentId: 1, createdAt: -1 });
// Enrolments for a program, by status (admin views).
enrollmentSchema.index({ programId: 1, status: 1 });
// Admin enrolment list, newest first, optionally by status.
enrollmentSchema.index({ status: 1, createdAt: -1 });
enrollmentSchema.index({ createdAt: -1 });

export const EnrollmentModel: Model<EnrollmentRecord> =
  (models.Enrollment as Model<EnrollmentRecord> | undefined) ?? model<EnrollmentRecord>("Enrollment", enrollmentSchema);

import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import {
  CURRENCY_PATTERN,
  MAX_PRICE_MINOR_UNITS,
  OPEN_PAYMENT_STATUSES,
  PAYMENT_ATTENTION_REASONS,
  PAYMENT_MODES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  type PaymentAttentionReason,
  type PaymentMode,
  type PaymentProviderName,
  type PaymentStatus,
} from "@/lib/constants";

/*
 * One online payment attempt for a program (one provider order).
 *
 * Stores references and amounts only: never card numbers, CVVs, UPI ids or
 * PINs, contact details from the provider, or raw provider payloads.
 * Records are never deleted, so payment history is preserved; the status
 * only changes through the payment service (src/lib/services/payment-service.ts).
 */

export type PaymentRecord = {
  studentId: Types.ObjectId;
  programId: Types.ObjectId;
  /** Set once the payment has activated (or been linked to) an enrolment. */
  enrollmentId: Types.ObjectId | null;
  provider: PaymentProviderName;
  /** Which credentials created it; test and live records never mix. */
  mode: PaymentMode;
  providerOrderId: string | null;
  /** The provider payment that settled (or last attempted) this order. */
  providerPaymentId: string | null;
  /** Integer amount in the smallest currency unit (paise), copied from the program at checkout. */
  amount: number;
  currency: string;
  status: PaymentStatus;
  /** Random, server-generated; sent to the provider as the order `receipt`. */
  idempotencyKey: string;
  /** Short machine-readable reason for a failure (our code or the provider's error code). */
  failureCode: string | null;
  /** Set when the payment needs an administrator's follow-up (see PAYMENT_ATTENTION_REASONS). */
  attentionReason: PaymentAttentionReason | null;
  /** How "paid" was confirmed: checkout signature + provider fetch, signed webhook, or reconciliation. */
  verifiedVia: "checkout" | "webhook" | "reconciliation" | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const providerIdField = { type: String, default: null, match: /^[A-Za-z0-9_]{1,64}$/ };

const paymentSchema = new Schema<PaymentRecord>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", default: null },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    mode: { type: String, enum: PAYMENT_MODES, required: true },
    providerOrderId: providerIdField,
    providerPaymentId: providerIdField,
    amount: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_PRICE_MINOR_UNITS,
      validate: { validator: Number.isInteger, message: "Amounts must be whole numbers of the smallest currency unit." },
    },
    currency: { type: String, required: true, uppercase: true, match: CURRENCY_PATTERN },
    status: { type: String, enum: PAYMENT_STATUSES, required: true, default: "created" },
    idempotencyKey: { type: String, required: true, match: /^[A-Za-z0-9-]{16,40}$/ },
    failureCode: { type: String, default: null, maxlength: 64 },
    attentionReason: { type: String, enum: [...PAYMENT_ATTENTION_REASONS, null], default: null },
    verifiedVia: { type: String, enum: ["checkout", "webhook", "reconciliation", null], default: null },
    paidAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true, strict: "throw" },
);

const isString = { $type: "string" };

paymentSchema.index({ idempotencyKey: 1 }, { unique: true, name: "unique_idempotency_key" });
// A provider order or payment belongs to exactly one local record.
paymentSchema.index(
  { provider: 1, providerOrderId: 1 },
  { unique: true, name: "unique_provider_order", partialFilterExpression: { providerOrderId: isString } },
);
paymentSchema.index(
  { provider: 1, providerPaymentId: 1 },
  { unique: true, name: "unique_provider_payment", partialFilterExpression: { providerPaymentId: isString } },
);
// At most one payment the student can still complete per program and mode, so
// refreshing or double-clicking never creates a second order.
paymentSchema.index(
  { studentId: 1, programId: 1, mode: 1 },
  {
    unique: true,
    name: "unique_open_payment",
    partialFilterExpression: { status: { $in: [...OPEN_PAYMENT_STATUSES] } },
  },
);
// A student's payments, newest first.
paymentSchema.index({ studentId: 1, createdAt: -1 });
// Admin list and filters.
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ programId: 1, createdAt: -1 });
// Revenue reports: confirmed payments by mode and payment time.
paymentSchema.index({ mode: 1, status: 1, paidAt: 1 });
paymentSchema.index({ attentionReason: 1, createdAt: -1 }, { partialFilterExpression: { attentionReason: isString } });

export const PaymentModel: Model<PaymentRecord> =
  (models.Payment as Model<PaymentRecord> | undefined) ?? model<PaymentRecord>("Payment", paymentSchema);

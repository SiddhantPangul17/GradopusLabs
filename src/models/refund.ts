import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import {
  CURRENCY_PATTERN,
  MAX_PRICE_MINOR_UNITS,
  PAYMENT_PROVIDERS,
  REFUND_STATUSES,
  type PaymentProviderName,
  type RefundStatus,
} from "@/lib/constants";

/*
 * PREPARED, NOT IN USE: refunds are not implemented.
 *
 * A refund is its own record with its own status, separate from the payment
 * status. When implemented, a refund must be created through the provider's
 * refund API and only marked "processed" after the provider confirms it
 * (signed webhook or API fetch); changing a status in the database never
 * moves money. See src/lib/services/refund-service.ts.
 */

export type RefundRecord = {
  paymentId: Types.ObjectId;
  provider: PaymentProviderName;
  providerRefundId: string | null;
  amount: number;
  currency: string;
  status: RefundStatus;
  reason: string;
  requestedBy: Types.ObjectId | null;
  processedAt: Date | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const refundSchema = new Schema<RefundRecord>(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", required: true },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    providerRefundId: { type: String, default: null, match: /^[A-Za-z0-9_]{1,64}$/ },
    amount: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_PRICE_MINOR_UNITS,
      validate: { validator: Number.isInteger, message: "Amounts must be whole numbers of the smallest currency unit." },
    },
    currency: { type: String, required: true, uppercase: true, match: CURRENCY_PATTERN },
    status: { type: String, enum: REFUND_STATUSES, required: true, default: "requested" },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    processedAt: { type: Date, default: null },
    failureCode: { type: String, default: null, maxlength: 64 },
  },
  { timestamps: true, strict: "throw" },
);

refundSchema.index(
  { provider: 1, providerRefundId: 1 },
  { unique: true, name: "unique_provider_refund", partialFilterExpression: { providerRefundId: { $type: "string" } } },
);
refundSchema.index({ paymentId: 1, createdAt: -1 });

export const RefundModel: Model<RefundRecord> =
  (models.Refund as Model<RefundRecord> | undefined) ?? model<RefundRecord>("Refund", refundSchema);

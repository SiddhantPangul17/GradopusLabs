import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import { PAYMENT_PROVIDERS, type PaymentProviderName } from "@/lib/constants";

/*
 * Webhook deliveries that passed signature verification, keyed by the
 * provider's event id, so duplicate deliveries are processed once. Stores the
 * event type and outcome only, not the payload.
 */

export const WEBHOOK_EVENT_STATUSES = ["processing", "processed", "ignored", "failed"] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

export type WebhookEventRecord = {
  provider: PaymentProviderName;
  eventId: string;
  eventType: string;
  status: WebhookEventStatus;
  /** Short reason for "ignored"/"failed" (e.g. "unknown_order", "transition_not_allowed"). */
  outcome: string | null;
  paymentId: Types.ObjectId | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
};

const webhookEventSchema = new Schema<WebhookEventRecord>(
  {
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    eventId: { type: String, required: true, maxlength: 100 },
    eventType: { type: String, required: true, maxlength: 64 },
    status: { type: String, enum: WEBHOOK_EVENT_STATUSES, required: true, default: "processing" },
    outcome: { type: String, default: null, maxlength: 64 },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
    attempts: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, strict: "throw", collection: "webhook_events" },
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true, name: "unique_provider_event" });
webhookEventSchema.index({ paymentId: 1, createdAt: -1 });
// Operations page: failed / stuck deliveries.
webhookEventSchema.index({ status: 1, updatedAt: -1 });

export const WebhookEventModel: Model<WebhookEventRecord> =
  (models.WebhookEvent as Model<WebhookEventRecord> | undefined) ??
  model<WebhookEventRecord>("WebhookEvent", webhookEventSchema);

import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/constants";

/*
 * In-app notifications for students. Database-backed (no real-time
 * transport). Links are internal paths only (validated by the service).
 * One notification per business event (unique key per user). Removed after
 * 365 days (TTL index).
 */

export type NotificationRecord = {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  /** Internal path such as /student/certificates/GOL-2026-000001. */
  link: string | null;
  idempotencyKey: string;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const notificationSchema = new Schema<NotificationRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    link: { type: String, default: null, maxlength: 300 },
    idempotencyKey: { type: String, required: true, maxlength: 200 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, strict: "throw" },
);

notificationSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, name: "unique_notification" });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60, name: "retention" });

export const NotificationModel: Model<NotificationRecord> =
  (models.Notification as Model<NotificationRecord> | undefined) ??
  model<NotificationRecord>("Notification", notificationSchema);

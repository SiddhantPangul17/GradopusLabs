import "server-only";
import { Types } from "mongoose";
import type { NotificationType } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { isDuplicateKeyError } from "@/lib/errors";
import { assertStudent, type Actor } from "@/lib/services/authorization";
import { fail, type ServiceResult } from "@/lib/services/result";
import { isValidObjectIdString } from "@/lib/validation/common";
import { NotificationModel } from "@/models/notification";

/*
 * In-app notifications (database-backed). Students can only list and mark
 * their own: ownership is part of every query. Links are internal student
 * paths only, so a notification can never become an open redirect.
 */

export const NOTIFICATIONS_PAGE_SIZE = 20;

/** Only same-site student paths, e.g. /student/certificates/GL-2026-000001 or /student/tasks/<id>#attempt-2. */
export function safeInternalLink(link: string | null | undefined): string | null {
  if (!link) return null;
  // Segments of letters, digits and . _ ~ - only, never "." or ".." (no //host, schemes, backslashes or traversal).
  return /^\/student(?:\/(?!\.{1,2}(?:\/|#|$))[A-Za-z0-9._~-]+)*\/?(?:#[A-Za-z0-9_-]+)?$/.test(link) && link.length <= 300 ? link : null;
}

/** Creates one notification per event (idempotent). Never throws. */
export async function createNotification(input: {
  userId: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  idempotencyKey: string;
}): Promise<void> {
  try {
    await connectToDatabase();
    await NotificationModel.create({
      userId: new Types.ObjectId(String(input.userId)),
      type: input.type,
      title: input.title.slice(0, 120),
      message: input.message.slice(0, 500),
      link: safeInternalLink(input.link),
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) console.error(`[notifications] could not create a ${input.type} notification`);
  }
}

export type NotificationView = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export async function listOwnNotifications(actor: Actor, requestedPage?: number) {
  assertStudent(actor);
  await connectToDatabase();
  const query = { userId: new Types.ObjectId(actor.id) };
  const [total, unread] = await Promise.all([
    NotificationModel.countDocuments(query),
    NotificationModel.countDocuments({ ...query, readAt: null }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(requestedPage ?? 1) || 1), totalPages);
  const docs = await NotificationModel.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * NOTIFICATIONS_PAGE_SIZE)
    .limit(NOTIFICATIONS_PAGE_SIZE)
    .lean();
  return {
    total,
    unread,
    page,
    totalPages,
    items: docs.map(
      (doc): NotificationView => ({
        id: doc._id.toString(),
        type: doc.type,
        title: doc.title,
        message: doc.message,
        link: safeInternalLink(doc.link),
        read: doc.readAt !== null,
        createdAt: doc.createdAt.toISOString(),
      }),
    ),
  };
}

export async function countUnreadNotifications(actor: Actor): Promise<number> {
  assertStudent(actor);
  await connectToDatabase();
  return NotificationModel.countDocuments({ userId: new Types.ObjectId(actor.id), readAt: null });
}

export async function markNotificationRead(actor: Actor, notificationId: string): Promise<ServiceResult<null>> {
  assertStudent(actor);
  if (!isValidObjectIdString(notificationId)) return fail("not_found", "Notification not found.");
  await connectToDatabase();
  // Another user's notification matches nothing, exactly like a missing one.
  const own = await NotificationModel.exists({ _id: notificationId, userId: actor.id });
  if (!own) return fail("not_found", "Notification not found.");
  await NotificationModel.updateOne({ _id: notificationId, userId: actor.id, readAt: null }, { $set: { readAt: new Date() } });
  return { ok: true, data: null };
}

export async function markAllNotificationsRead(actor: Actor): Promise<number> {
  assertStudent(actor);
  await connectToDatabase();
  const result = await NotificationModel.updateMany({ userId: actor.id, readAt: null }, { $set: { readAt: new Date() } });
  return result.modifiedCount;
}

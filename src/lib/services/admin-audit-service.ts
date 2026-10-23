import "server-only";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, type AuditAction, type AuditEntityType } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { assertAdmin, type Actor } from "@/lib/services/authorization";
import { AuditLogModel } from "@/models/audit-log";
import { UserModel } from "@/models/user";

/* Read-only audit history for administrators (entries are append-only). */

export const AUDIT_PAGE_SIZE = 30;

export type AuditListItem = {
  id: string;
  createdAt: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  actor: string;
  metadata: Record<string, unknown>;
};

export async function listAuditLogs(actor: Actor, options: { action?: string; entityType?: string; page?: number; limit?: number } = {}) {
  assertAdmin(actor);
  await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (options.action && (AUDIT_ACTIONS as readonly string[]).includes(options.action)) query.action = options.action;
  if (options.entityType && (AUDIT_ENTITY_TYPES as readonly string[]).includes(options.entityType)) query.entityType = options.entityType;

  const limit = Math.min(Math.max(1, options.limit ?? AUDIT_PAGE_SIZE), AUDIT_PAGE_SIZE);
  const total = await AuditLogModel.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1) || 1), totalPages);
  const docs = await AuditLogModel.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean();

  const actorIds = docs.flatMap((doc) => (doc.actorId ? [doc.actorId] : []));
  const actors = await UserModel.find({ _id: { $in: actorIds } }).select("name email").lean();
  const actorBy = new Map(actors.map((user) => [user._id.toString(), `${user.name} (${user.email})`]));

  return {
    total,
    totalPages,
    page,
    items: docs.map((doc): AuditListItem => ({
      id: doc._id.toString(),
      createdAt: doc.createdAt.toISOString(),
      action: doc.action,
      entityType: doc.entityType,
      entityId: doc.entityId.toString(),
      actor: doc.actorId ? (actorBy.get(doc.actorId.toString()) ?? "Deleted user") : "System (command line)",
      metadata: doc.metadata ?? {},
    })),
  };
}

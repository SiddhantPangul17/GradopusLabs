import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, type AuditAction, type AuditEntityType } from "@/lib/constants";

/*
 * Append-only record of administrative actions (program changes, role
 * changes, certificate issuance and revocation, ...).
 *
 * Write entries through recordAuditEvent() in src/lib/services/audit-log.ts,
 * which strips sensitive keys from `metadata`. Never store passwords, tokens,
 * payment credentials or unnecessary personal data here.
 */

export type AuditLogRecord = {
  /** The user who acted; null for system actions. */
  actorId: Types.ObjectId | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: Types.ObjectId;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

const auditLogSchema = new Schema<AuditLogRecord>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entityType: { type: String, enum: AUDIT_ENTITY_TYPES, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    strict: "throw",
    collection: "audit_logs",
  },
);

// History of one entity, newest first.
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
// Everything one actor did, newest first.
auditLogSchema.index({ actorId: 1, createdAt: -1 });
// Admin audit history: newest first, optionally filtered by action.
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// Entries are immutable once written.
const rejectChange = () => {
  throw new Error("Audit log entries cannot be modified or deleted.");
};
auditLogSchema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"], rejectChange);
auditLogSchema.pre(["deleteOne", "deleteMany", "findOneAndDelete"], rejectChange);
auditLogSchema.pre("save", function () {
  if (!this.isNew) rejectChange();
});

export const AuditLogModel: Model<AuditLogRecord> =
  (models.AuditLog as Model<AuditLogRecord> | undefined) ?? model<AuditLogRecord>("AuditLog", auditLogSchema);

import "server-only";
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db/mongodb";
import type { AuditAction, AuditEntityType } from "@/lib/constants";
import { AuditLogModel } from "@/models/audit-log";

/** Keys that must never be written to audit metadata. */
const SENSITIVE_KEY =
  /pass(word|phrase|code)?|secret|token|authorization|cookie|session|card|cvv|cvc|otp|hash|iban|account_?number|upi|api_?key/i;
const MAX_DEPTH = 3;
const MAX_STRING = 500;
const MAX_ARRAY = 20;
const MAX_SERIALIZED = 4_000;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Types.ObjectId) return value.toString();
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => sanitizeValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key) || key.startsWith("$")) continue;
      const clean = sanitizeValue(item, depth + 1);
      if (clean !== undefined) result[key] = clean;
    }
    return result;
  }
  return undefined; // functions, class instances, buffers, etc.
}

/**
 * Removes sensitive keys and non-plain values, and bounds the size of audit
 * metadata. Callers should still pass only what is needed to explain the action.
 */
export function sanitizeAuditMetadata(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  const clean = sanitizeValue(metadata, 0);
  const result = clean && typeof clean === "object" && !Array.isArray(clean) ? (clean as Record<string, unknown>) : {};
  return JSON.stringify(result).length > MAX_SERIALIZED ? { truncated: true } : result;
}

export type AuditEvent = {
  /** Verified actor id, or null for system actions. */
  actorId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | Types.ObjectId;
  metadata?: Record<string, unknown>;
};

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  await connectToDatabase();
  await AuditLogModel.create({
    actorId: event.actorId ? new Types.ObjectId(event.actorId) : null,
    action: event.action,
    entityType: event.entityType,
    entityId: typeof event.entityId === "string" ? new Types.ObjectId(event.entityId) : event.entityId,
    metadata: sanitizeAuditMetadata(event.metadata),
  });
}

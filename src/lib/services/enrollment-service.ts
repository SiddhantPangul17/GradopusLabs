import "server-only";
import type { Types } from "mongoose";
import { CURRENT_ENROLLMENT_STATUSES, type EnrollmentStatus } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { isDuplicateKeyError } from "@/lib/errors";
import { notifyEnrollmentActivated } from "@/lib/notifications/events";
import { recordAuditEvent } from "@/lib/services/audit-log";
import type { Actor } from "@/lib/services/authorization";
import { isValidObjectIdString } from "@/lib/validation/common";
import { EnrollmentModel, type EnrollmentRecord } from "@/models/enrollment";
import { ProgramModel } from "@/models/program";
import { UserModel } from "@/models/user";

/** Safe, serialisable view of an enrolment. */
export type EnrollmentSummary = {
  id: string;
  studentId: string;
  programId: string;
  status: EnrollmentStatus;
  amountPaid: number;
  currency: string;
  enrolledAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type EnrollmentDocument = EnrollmentRecord & { _id: Types.ObjectId };

export function toEnrollmentSummary(doc: EnrollmentDocument): EnrollmentSummary {
  return {
    id: doc._id.toString(),
    studentId: doc.studentId.toString(),
    programId: doc.programId.toString(),
    status: doc.status,
    amountPaid: doc.amountPaid,
    currency: doc.currency,
    enrolledAt: doc.enrolledAt?.toISOString() ?? null,
    completedAt: doc.completedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Returns an enrolment only to its student or an admin. Returns null both
 * when it does not exist and when the viewer may not see it, so callers cannot
 * probe for other students' enrolments.
 */
export async function getEnrollmentForViewer(enrollmentId: string, viewer: Actor): Promise<EnrollmentSummary | null> {
  if (!isValidObjectIdString(enrollmentId)) return null;
  await connectToDatabase();
  const doc = await EnrollmentModel.findById(enrollmentId).lean<EnrollmentDocument>();
  if (!doc) return null;
  const isOwner = doc.studentId.toString() === viewer.id;
  return isOwner || viewer.role === "admin" ? toEnrollmentSummary(doc) : null;
}

export type ManualEnrollmentResult =
  | { ok: true; enrollmentId: string }
  | { ok: false; reason: "student_not_found" | "program_not_found" | "already_enrolled" };

/**
 * Creates an ACTIVE enrolment without payment, for operators (via
 * `npm run enroll:student`) until online payment exists. TRUSTED callers only:
 * no role check here, so it must never be reachable from a public route.
 * Recorded with source "manual" and amountPaid 0 (no payment is implied) and
 * audited. The database prevents duplicate current enrolments.
 */
export async function createManualEnrollment(
  input: { email: string; programSlug: string },
  actor: { actorId: string | null; via: "cli" | "admin" },
): Promise<ManualEnrollmentResult> {
  await connectToDatabase();
  await EnrollmentModel.init();
  const user = await UserModel.findOne({ email: input.email.trim().toLowerCase(), role: "student", accountStatus: "active" })
    .select("_id")
    .lean();
  if (!user) return { ok: false, reason: "student_not_found" };
  // New enrolments only for programs on sale (published).
  const program = await ProgramModel.findOne({ slug: input.programSlug, status: "published" }).select("_id slug title currency").lean();
  if (!program) return { ok: false, reason: "program_not_found" };

  let created;
  try {
    created = await EnrollmentModel.create({
      studentId: user._id,
      programId: program._id,
      status: "active",
      source: "manual",
      amountPaid: 0,
      currency: program.currency,
      enrolledAt: new Date(),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) return { ok: false, reason: "already_enrolled" };
    throw error;
  }

  await recordAuditEvent({
    actorId: actor.actorId,
    action: "enrollment.created",
    entityType: "enrollment",
    entityId: created._id,
    metadata: { via: actor.via, source: "manual", programSlug: program.slug },
  });
  await notifyEnrollmentActivated({ _id: created._id, studentId: user._id }, program.title);
  return { ok: true, enrollmentId: created._id.toString() };
}

/** True if the student has a pending or active enrolment in the program. */
export async function hasCurrentEnrollment(studentId: string, programId: string): Promise<boolean> {
  if (!isValidObjectIdString(studentId) || !isValidObjectIdString(programId)) return false;
  await connectToDatabase();
  const existing = await EnrollmentModel.exists({
    studentId,
    programId,
    status: { $in: [...CURRENT_ENROLLMENT_STATUSES] },
  });
  return existing !== null;
}

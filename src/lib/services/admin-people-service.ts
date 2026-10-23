import "server-only";
import { Types } from "mongoose";
import { formFieldErrors } from "@/lib/admin/form-parsing";
import type { AccountStatus, EnrollmentSource, EnrollmentStatus } from "@/lib/constants";
import { ENROLLMENT_STATUSES } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { recordAuditEvent } from "@/lib/services/audit-log";
import { assertAdmin, type Actor } from "@/lib/services/authorization";
import { createManualEnrollment } from "@/lib/services/enrollment-service";
import { fail, type ServiceResult } from "@/lib/services/result";
import { manualEnrollmentSchema, studentStatusChangeSchema } from "@/lib/validation/admin";
import { isValidObjectIdString } from "@/lib/validation/common";
import { EnrollmentModel } from "@/models/enrollment";
import { LearningProgressModel } from "@/models/learning-progress";
import { ProgramModel } from "@/models/program";
import { UserModel } from "@/models/user";

/*
 * Students and enrolments for administrators: paginated, read-mostly lists.
 * Only fields needed for administration are returned (never password hashes,
 * session data or tokens). The only changes possible here are suspending /
 * reactivating a STUDENT account (with a reason) and granting a manual
 * enrolment; both are audited. Payment state cannot be set here.
 */

type Id = Types.ObjectId;
export const PEOPLE_PAGE_SIZE = 25;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function paginate(total: number, requested: number | undefined) {
  const totalPages = Math.max(1, Math.ceil(total / PEOPLE_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(requested ?? 1) || 1), totalPages);
  return { totalPages, page, skip: (page - 1) * PEOPLE_PAGE_SIZE };
}

// ---------- Students ----------

export type StudentListItem = {
  id: string;
  name: string;
  email: string;
  accountStatus: AccountStatus;
  createdAt: string;
  enrollments: number;
};

export async function listStudents(actor: Actor, options: { q?: string; page?: number } = {}) {
  assertAdmin(actor);
  await connectToDatabase();
  const query: Record<string, unknown> = { role: "student" };
  const q = options.q?.trim().slice(0, 100);
  if (q) {
    // Case-insensitive "contains" on name or email; user input is escaped, never used as a pattern.
    const pattern = new RegExp(escapeRegex(q), "i");
    query.$or = [{ name: pattern }, { email: pattern }];
  }
  const total = await UserModel.countDocuments(query);
  const { totalPages, page, skip } = paginate(total, options.page);
  const users = await UserModel.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(PEOPLE_PAGE_SIZE)
    .select("name email accountStatus createdAt")
    .lean();
  const counts = await EnrollmentModel.aggregate<{ _id: Id; count: number }>([
    { $match: { studentId: { $in: users.map((user) => user._id) } } },
    { $group: { _id: "$studentId", count: { $sum: 1 } } },
  ]);
  const countBy = new Map(counts.map((item) => [item._id.toString(), item.count]));

  return {
    total,
    totalPages,
    page,
    items: users.map((user): StudentListItem => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      accountStatus: user.accountStatus,
      createdAt: user.createdAt.toISOString(),
      enrollments: countBy.get(user._id.toString()) ?? 0,
    })),
  };
}

/**
 * Suspends or reactivates a STUDENT account (admins are managed with the
 * admin CLI). Suspension ends all sessions immediately; nothing is deleted.
 */
export async function setStudentAccountStatus(actor: Actor, studentId: string, input: unknown): Promise<ServiceResult<{ status: AccountStatus }>> {
  assertAdmin(actor);
  const parsed = studentStatusChangeSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please correct the highlighted fields.", formFieldErrors(parsed.error));
  if (!isValidObjectIdString(studentId)) return fail("not_found", "Student not found.");
  if (studentId === actor.id) return fail("forbidden", "You cannot change your own account status.");

  await connectToDatabase();
  const student = await UserModel.findOne({ _id: new Types.ObjectId(studentId), role: "student" }).select("accountStatus email").lean();
  if (!student) return fail("not_found", "Student not found.");
  const target = parsed.data.status;
  if (student.accountStatus === target) return fail("conflict", `This account is already ${target}.`);

  const update = target === "suspended" ? { $set: { accountStatus: target }, $inc: { sessionVersion: 1 } } : { $set: { accountStatus: target } };
  const result = await UserModel.updateOne({ _id: student._id, role: "student", accountStatus: student.accountStatus }, update);
  if (result.modifiedCount !== 1) return fail("conflict", "The account changed while you were working. Reload and try again.");

  await recordAuditEvent({
    actorId: actor.id,
    action: "user.status_changed",
    entityType: "user",
    entityId: student._id,
    metadata: { from: student.accountStatus, to: target, reason: parsed.data.reason },
  });
  return { ok: true, data: { status: target } };
}

// ---------- Enrolments ----------

export type EnrollmentListItem = {
  id: string;
  student: { id: string; name: string; email: string };
  program: { id: string; title: string };
  status: EnrollmentStatus;
  source: EnrollmentSource;
  amountPaid: number;
  currency: string;
  enrolledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  /** From the cached progress snapshot; null if none yet. */
  progress: { percent: number; state: string } | null;
};

export async function listEnrollments(actor: Actor, options: { status?: string; programId?: string; page?: number } = {}) {
  assertAdmin(actor);
  await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (options.status && (ENROLLMENT_STATUSES as readonly string[]).includes(options.status)) query.status = options.status;
  if (options.programId && isValidObjectIdString(options.programId)) query.programId = new Types.ObjectId(options.programId);

  const total = await EnrollmentModel.countDocuments(query);
  const { totalPages, page, skip } = paginate(total, options.page);
  const docs = await EnrollmentModel.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(PEOPLE_PAGE_SIZE).lean();
  const [students, programs, progress] = await Promise.all([
    UserModel.find({ _id: { $in: docs.map((doc) => doc.studentId) } }).select("name email").lean(),
    ProgramModel.find({ _id: { $in: docs.map((doc) => doc.programId) } }).select("title").lean(),
    LearningProgressModel.find({ enrollmentId: { $in: docs.map((doc) => doc._id) } }).select("enrollmentId snapshot").lean(),
  ]);
  const studentBy = new Map(students.map((student) => [student._id.toString(), student]));
  const programBy = new Map(programs.map((program) => [program._id.toString(), program]));
  const progressBy = new Map(progress.map((item) => [item.enrollmentId.toString(), item.snapshot]));

  return {
    total,
    totalPages,
    page,
    items: docs.map((doc): EnrollmentListItem => {
      const student = studentBy.get(doc.studentId.toString());
      const snapshot = progressBy.get(doc._id.toString());
      return {
        id: doc._id.toString(),
        student: { id: doc.studentId.toString(), name: student?.name ?? "Unknown student", email: student?.email ?? "" },
        program: { id: doc.programId.toString(), title: programBy.get(doc.programId.toString())?.title ?? "Unknown program" },
        status: doc.status,
        source: doc.source ?? "manual",
        amountPaid: doc.amountPaid,
        currency: doc.currency,
        enrolledAt: doc.enrolledAt?.toISOString() ?? null,
        completedAt: doc.completedAt?.toISOString() ?? null,
        createdAt: doc.createdAt.toISOString(),
        progress: snapshot ? { percent: snapshot.percent, state: snapshot.state } : null,
      };
    }),
  };
}

/** Grants a manual (unpaid) enrolment from the dashboard. Audited with the admin as actor. */
export async function createManualEnrollmentAsAdmin(actor: Actor, input: unknown): Promise<ServiceResult<{ enrollmentId: string }>> {
  assertAdmin(actor);
  const parsed = manualEnrollmentSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please correct the highlighted fields.", formFieldErrors(parsed.error));
  const result = await createManualEnrollment(
    { email: parsed.data.email, programSlug: parsed.data.programSlug },
    { actorId: actor.id, via: "admin" },
  );
  if (result.ok) return { ok: true, data: { enrollmentId: result.enrollmentId } };
  const messages = {
    student_not_found: { email: "No active student account uses this email address." },
    program_not_found: { programSlug: "Choose a published program." },
    already_enrolled: { email: "This student already has a pending or active enrolment in this program." },
  } as const;
  return fail(result.reason === "already_enrolled" ? "conflict" : "invalid", "Please correct the highlighted fields.", messages[result.reason]);
}

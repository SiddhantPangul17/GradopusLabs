import "server-only";
import { Types } from "mongoose";
import { brand } from "@/config/brand";
import { formFieldErrors } from "@/lib/admin/form-parsing";
import { getCertificateConfig, verificationUrl } from "@/lib/certificates/config";
import { formatCertificateId, issueYear, normalizeCertificateId } from "@/lib/certificates/ids";
import { renderCertificatePdf } from "@/lib/certificates/pdf";
import { isPrintableOnCertificate } from "@/lib/certificates/printable";
import {
  generateVerificationToken,
  hashVerificationToken,
  isVerificationTokenFormat,
  openToken,
  sealToken,
} from "@/lib/certificates/token";
import { CERTIFICATE_STATUSES, CERTIFICATE_TEMPLATE_VERSION, type CertificateStatus } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { isDuplicateKeyError } from "@/lib/errors";
import { notifyCertificateIssued, notifyCertificateReplaced, notifyCertificateRevoked } from "@/lib/notifications/events";
import { recordAuditEvent } from "@/lib/services/audit-log";
import { assertAdmin, assertStudent, type Actor } from "@/lib/services/authorization";
import { evaluateEnrollmentCompletion } from "@/lib/services/learning-service";
import { fail, type ServiceResult } from "@/lib/services/result";
import { isValidObjectIdString } from "@/lib/validation/common";
import { issueCertificateSchema, replaceCertificateSchema, revokeCertificateSchema } from "@/lib/validation/certificate";
import { CertificateModel, type CertificateRecord } from "@/models/certificate";
import { CounterModel } from "@/models/counter";
import { EnrollmentModel } from "@/models/enrollment";
import { LearningProgressModel } from "@/models/learning-progress";
import { PaymentModel } from "@/models/payment";
import { ProgramModel } from "@/models/program";
import { UserModel } from "@/models/user";

/*
 * Certificate lifecycle: eligibility, issuance, revocation, replacement,
 * PDF generation and public verification. See docs/certificates.md.
 *
 * - Eligibility comes only from server-side records, using the same progress
 *   rule as the learning area (evaluateEnrollmentCompletion). Paying never
 *   earns a certificate by itself.
 * - Only administrators issue, revoke or replace (actor from the session,
 *   re-checked here). Every consequential action is audited.
 * - At most one VALID certificate per enrolment (unique partial index), so
 *   repeated or concurrent issuance cannot create duplicates.
 * - Records are never deleted; numbers are never reused.
 */

type Id = Types.ObjectId;
type CertificateDoc = CertificateRecord & { _id: Id };

let indexesReady: Promise<unknown> | null = null;
async function ready(): Promise<void> {
  await connectToDatabase();
  indexesReady ??= Promise.all([CertificateModel.init(), CounterModel.init()]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
}

async function assertActiveAdmin(actor: Actor): Promise<void> {
  assertAdmin(actor);
  await connectToDatabase();
  const active = await UserModel.exists({ _id: actor.id, role: "admin", accountStatus: "active" });
  if (!active) assertAdmin(null);
}

// ---------- Eligibility ----------

export type EligibilityIssueCode =
  | "enrollment_not_found"
  | "student_mismatch"
  | "student_not_found"
  | "student_inactive"
  | "program_not_found"
  | "program_unpublished"
  | "criteria_undefined"
  | "enrollment_inactive"
  | "requirements_incomplete"
  | "payment_not_confirmed"
  | "already_issued"
  | "previously_revoked"
  | "unprintable_text";

export type EligibilityIssue = { code: EligibilityIssueCode; message: string };

export type EligibilityResult = {
  eligible: boolean;
  issues: EligibilityIssue[];
  progress: { completedModules: number; totalModules: number; percent: number; state: string } | null;
  /** Present when the records exist (needed to issue). */
  context: {
    enrollmentId: Id;
    studentId: Id;
    programId: Id;
    studentName: string;
    programTitle: string;
    completionDate: Date | null;
  } | null;
  existingCertificateId: string | null;
};

/**
 * THE certificate eligibility check, shared by the admin list and issuance.
 * Reads trusted records only; nothing from the browser can make a student eligible.
 */
export async function checkCertificateEligibility(
  enrollmentId: string,
  options: { expectedStudentId?: string } = {},
): Promise<EligibilityResult> {
  const issues: EligibilityIssue[] = [];
  const add = (code: EligibilityIssueCode, message: string) => issues.push({ code, message });
  const empty = (code: EligibilityIssueCode, message: string): EligibilityResult => ({
    eligible: false,
    issues: [{ code, message }],
    progress: null,
    context: null,
    existingCertificateId: null,
  });

  const completion = await evaluateEnrollmentCompletion(enrollmentId);
  if (!completion) return empty("enrollment_not_found", "Enrolment not found.");
  const { enrollment, progress } = completion;
  if (options.expectedStudentId && enrollment.studentId.toString() !== options.expectedStudentId) {
    return empty("student_mismatch", "This enrolment belongs to a different student.");
  }

  const [student, program, certificates] = await Promise.all([
    UserModel.findById(enrollment.studentId).select("name role accountStatus").lean(),
    ProgramModel.findById(enrollment.programId).select("title status completionCriteria").lean(),
    CertificateModel.find({ enrollmentId: enrollment._id }).select("certificateId status").lean(),
  ]);

  if (!student || student.role !== "student") add("student_not_found", "The student account no longer exists.");
  else if (student.accountStatus !== "active") add("student_inactive", "The student's account is not active.");

  if (!program) {
    add("program_not_found", "The program no longer exists.");
    return { eligible: false, issues, progress: null, context: null, existingCertificateId: null };
  }
  if (program.status === "draft") add("program_unpublished", "The program is in draft; certificates are issued only for published or archived programs.");
  if (program.completionCriteria.length === 0 || progress.totalModules === 0) {
    add("criteria_undefined", "The program has no published completion criteria or no published modules. Define them before issuing certificates.");
  }
  if (completion.requiredFileTasks > 0) {
    add("criteria_undefined", "The program has required file-upload tasks, which students cannot submit yet.");
  }

  if (enrollment.status !== "active" && enrollment.status !== "completed") {
    add("enrollment_inactive", `The enrolment is ${enrollment.status}.`);
  }
  if (!progress.eligibleForCertificate) {
    const waiting = progress.modules.reduce((sum, module) => sum + module.awaitingReview, 0);
    add(
      "requirements_incomplete",
      `Requirements not met: ${progress.completedModules} of ${progress.totalModules} modules complete${waiting > 0 ? `, ${waiting} required task(s) awaiting review` : ""}.`,
    );
  }

  // Paid enrolments must still have a confirmed (not refunded) payment. Manual
  // enrolments were granted by an administrator without payment.
  if (enrollment.source === "payment") {
    const payment = enrollment.paymentId ? await PaymentModel.findById(enrollment.paymentId).select("status").lean() : null;
    if (payment?.status !== "paid") add("payment_not_confirmed", "The payment for this enrolment is not confirmed (or was refunded).");
  }

  const issued = certificates.find((certificate) => certificate.status === "issued");
  if (issued) add("already_issued", `A valid certificate (${issued.certificateId}) already exists for this enrolment.`);
  if (certificates.some((certificate) => certificate.status === "revoked")) {
    add("previously_revoked", "A certificate for this enrolment was revoked; a new one cannot be issued automatically.");
  }

  const studentName = student?.name ?? "";
  if (student && !isPrintableOnCertificate(studentName)) {
    add("unprintable_text", "The student's name contains characters the certificate template cannot print yet (English letters and Western European accents only).");
  }
  if (!isPrintableOnCertificate(program.title)) {
    add("unprintable_text", "The program title contains characters the certificate template cannot print yet.");
  }

  return {
    eligible: issues.length === 0,
    issues,
    progress: { completedModules: progress.completedModules, totalModules: progress.totalModules, percent: progress.percent, state: progress.state },
    context: {
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      programId: enrollment.programId,
      studentName,
      programTitle: program.title,
      completionDate: completion.completedAt,
    },
    existingCertificateId: issued?.certificateId ?? null,
  };
}

// ---------- Numbers and records ----------

/** Next number from an atomic counter (never a "check then insert"). */
async function allocateCertificateId(issuedAt: Date): Promise<string> {
  const year = issueYear(issuedAt);
  const key = `certificate:${brand.certificate.prefix}:${year}`;
  const increment = () =>
    CounterModel.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after", lean: true });
  let counter;
  try {
    counter = await increment();
  } catch (error) {
    // Two first-ever allocations can race on the upsert; the retry increments the winner's counter.
    if (!isDuplicateKeyError(error)) throw error;
    counter = await increment();
  }
  if (!counter) throw new Error("Counter allocation failed");
  return formatCertificateId(brand.certificate.prefix, year, counter.seq);
}

class AlreadyIssuedError extends Error {}

function duplicateKeyName(error: unknown): string {
  const pattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  return Object.keys(pattern).join(",");
}

/** Creates the record with a fresh number and token. Throws AlreadyIssuedError if the enrolment already has a valid one. */
async function createCertificateRecord(input: {
  key: Buffer;
  context: NonNullable<EligibilityResult["context"]>;
  completionDate: Date;
  issuedBy: string;
  supersedes?: Id;
  correctionReason?: string;
}): Promise<CertificateDoc> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const issuedAt = new Date();
    const certificateId = await allocateCertificateId(issuedAt);
    const token = generateVerificationToken();
    try {
      const doc = await CertificateModel.create({
        certificateId,
        verificationTokenHash: hashVerificationToken(token),
        verificationTokenSealed: sealToken(token, input.key),
        studentId: input.context.studentId,
        programId: input.context.programId,
        enrollmentId: input.context.enrollmentId,
        studentNameSnapshot: input.context.studentName,
        programTitleSnapshot: input.context.programTitle,
        completionDate: input.completionDate,
        issuedAt,
        issuedBy: new Types.ObjectId(input.issuedBy),
        status: "issued",
        supersedesCertificateId: input.supersedes ?? null,
        correctionReason: input.correctionReason ?? null,
        templateVersion: CERTIFICATE_TEMPLATE_VERSION,
      });
      return doc.toObject() as CertificateDoc;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      if (duplicateKeyName(error).includes("enrollmentId")) throw new AlreadyIssuedError();
      // certificateId or token collision (e.g. a restored counter): take the next number; the old one stays unused.
    }
  }
  throw new Error("Could not allocate a unique certificate number");
}

// ---------- Issue / revoke / replace (admin) ----------

export async function issueCertificate(actor: Actor, input: unknown): Promise<ServiceResult<{ certificateId: string }>> {
  await assertActiveAdmin(actor);
  const parsed = issueCertificateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please confirm the issuance.", formFieldErrors(parsed.error));
  const config = getCertificateConfig();
  if (!config.ready) return fail("unavailable", `Certificates cannot be issued: ${config.reason}`);
  await ready();

  const eligibility = await checkCertificateEligibility(parsed.data.enrollmentId);
  if (!eligibility.eligible || !eligibility.context) {
    if (eligibility.context) {
      await recordAuditEvent({
        actorId: actor.id,
        action: "certificate.issue_refused",
        entityType: "enrollment",
        entityId: eligibility.context.enrollmentId,
        metadata: { reasons: eligibility.issues.map((issue) => issue.code) },
      });
    }
    return fail("conflict", eligibility.issues.map((issue) => issue.message).join(" "));
  }

  let created: CertificateDoc;
  try {
    created = await createCertificateRecord({
      key: config.key,
      context: eligibility.context,
      completionDate: eligibility.context.completionDate ?? new Date(),
      issuedBy: actor.id,
    });
  } catch (error) {
    if (error instanceof AlreadyIssuedError) return fail("conflict", "A valid certificate already exists for this enrolment.");
    throw error;
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: "certificate.issued",
    entityType: "certificate",
    entityId: created._id,
    metadata: {
      certificateId: created.certificateId,
      enrollmentId: created.enrollmentId.toString(),
      programId: created.programId.toString(),
      templateVersion: created.templateVersion,
    },
  });
  await notifyCertificateIssued(created);
  return { ok: true, data: { certificateId: created.certificateId } };
}

export async function revokeCertificate(actor: Actor, certificateId: string, input: unknown): Promise<ServiceResult<null>> {
  await assertActiveAdmin(actor);
  const parsed = revokeCertificateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please correct the highlighted fields.", formFieldErrors(parsed.error));
  const id = normalizeCertificateId(certificateId);
  if (!id) return fail("not_found", "Certificate not found.");
  await ready();

  const revoked = await CertificateModel.findOneAndUpdate(
    { certificateId: id, status: "issued" },
    { $set: { status: "revoked", revokedAt: new Date(), revokedBy: new Types.ObjectId(actor.id), revocationReason: parsed.data.reason } },
    { returnDocument: "after" },
  ).lean<CertificateDoc>();
  if (!revoked) {
    const exists = await CertificateModel.exists({ certificateId: id });
    return exists ? fail("conflict", "Only a currently valid certificate can be revoked.") : fail("not_found", "Certificate not found.");
  }
  await recordAuditEvent({
    actorId: actor.id,
    action: "certificate.revoked",
    entityType: "certificate",
    entityId: revoked._id,
    metadata: { certificateId: id, reason: parsed.data.reason },
  });
  await notifyCertificateRevoked(revoked);
  return { ok: true, data: null };
}

/**
 * Corrects a certificate: the old one becomes "superseded" and a new one is
 * issued with a NEW number and token, current name/title snapshots and the
 * original completion date. Completion was verified at the original issuance,
 * so later curriculum changes do not block a correction.
 *
 * Consistency without transactions: (1) compare-and-set the old one to
 * superseded, (2) create the new one, (3) link them. If (2) fails, (1) is
 * reverted. Links are also derivable from the new record's
 * `supersedesCertificateId`, so an interruption before (3) loses nothing.
 */
export async function replaceCertificate(actor: Actor, certificateId: string, input: unknown): Promise<ServiceResult<{ certificateId: string }>> {
  await assertActiveAdmin(actor);
  const parsed = replaceCertificateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please correct the highlighted fields.", formFieldErrors(parsed.error));
  const id = normalizeCertificateId(certificateId);
  if (!id) return fail("not_found", "Certificate not found.");
  const config = getCertificateConfig();
  if (!config.ready) return fail("unavailable", `Certificates cannot be issued: ${config.reason}`);
  await ready();

  const old = await CertificateModel.findOne({ certificateId: id }).lean<CertificateDoc>();
  if (!old) return fail("not_found", "Certificate not found.");
  if (old.status !== "issued") return fail("conflict", "Only a currently valid certificate can be replaced.");

  const [student, program] = await Promise.all([
    UserModel.findById(old.studentId).select("name role").lean(),
    ProgramModel.findById(old.programId).select("title").lean(),
  ]);
  if (!student || student.role !== "student" || !program) return fail("conflict", "The student or program record no longer exists.");
  if (!isPrintableOnCertificate(student.name) || !isPrintableOnCertificate(program.title)) {
    return fail("conflict", "The current name or program title contains characters the certificate template cannot print yet.");
  }

  const supersededAt = new Date();
  const marked = await CertificateModel.updateOne({ _id: old._id, status: "issued" }, { $set: { status: "superseded", supersededAt } });
  if (marked.modifiedCount !== 1) return fail("conflict", "The certificate changed while you were working. Reload and try again.");

  let created: CertificateDoc;
  try {
    created = await createCertificateRecord({
      key: config.key,
      context: {
        enrollmentId: old.enrollmentId,
        studentId: old.studentId,
        programId: old.programId,
        studentName: student.name,
        programTitle: program.title,
        completionDate: old.completionDate,
      },
      completionDate: old.completionDate,
      issuedBy: actor.id,
      supersedes: old._id,
      correctionReason: parsed.data.reason,
    });
  } catch (error) {
    await CertificateModel.updateOne(
      { _id: old._id, status: "superseded", supersededByCertificateId: null },
      { $set: { status: "issued", supersededAt: null } },
    );
    if (error instanceof AlreadyIssuedError) return fail("conflict", "Another valid certificate exists for this enrolment.");
    throw error;
  }
  await CertificateModel.updateOne({ _id: old._id }, { $set: { supersededByCertificateId: created._id } });

  await recordAuditEvent({
    actorId: actor.id,
    action: "certificate.superseded",
    entityType: "certificate",
    entityId: old._id,
    metadata: { certificateId: old.certificateId, replacedBy: created.certificateId, reason: parsed.data.reason },
  });
  await recordAuditEvent({
    actorId: actor.id,
    action: "certificate.issued",
    entityType: "certificate",
    entityId: created._id,
    metadata: { certificateId: created.certificateId, replaces: old.certificateId, enrollmentId: old.enrollmentId.toString() },
  });
  await notifyCertificateReplaced(old, created);
  return { ok: true, data: { certificateId: created.certificateId } };
}

// ---------- Views ----------

export type CertificateView = {
  certificateId: string;
  studentName: string;
  programTitle: string;
  completionDate: string;
  issuedAt: string;
  status: CertificateStatus;
  revokedAt: string | null;
  supersededAt: string | null;
  replaces: string | null;
  replacedBy: string | null;
  templateVersion: number;
};

/** Readable numbers of linked certificates (from either side of the link). */
async function linkedIds(docs: CertificateDoc[]): Promise<Map<string, { replaces: string | null; replacedBy: string | null }>> {
  const ids = docs.map((doc) => doc._id);
  const related = await CertificateModel.find({
    $or: [{ _id: { $in: docs.flatMap((doc) => [doc.supersedesCertificateId, doc.supersededByCertificateId]).filter(Boolean) } }, { supersedesCertificateId: { $in: ids } }],
  })
    .select("certificateId supersedesCertificateId")
    .lean<Pick<CertificateDoc, "_id" | "certificateId" | "supersedesCertificateId">[]>();
  const numberOf = new Map(related.map((item) => [item._id.toString(), item.certificateId]));
  const result = new Map<string, { replaces: string | null; replacedBy: string | null }>();
  for (const doc of docs) {
    const replacement = related.find((item) => item.supersedesCertificateId?.toString() === doc._id.toString());
    result.set(doc._id.toString(), {
      replaces: doc.supersedesCertificateId ? (numberOf.get(doc.supersedesCertificateId.toString()) ?? null) : null,
      replacedBy: replacement?.certificateId ?? (doc.supersededByCertificateId ? (numberOf.get(doc.supersededByCertificateId.toString()) ?? null) : null),
    });
  }
  return result;
}

async function toViews(docs: CertificateDoc[]): Promise<CertificateView[]> {
  const links = await linkedIds(docs);
  return docs.map((doc) => ({
    certificateId: doc.certificateId,
    studentName: doc.studentNameSnapshot,
    programTitle: doc.programTitleSnapshot,
    completionDate: doc.completionDate.toISOString(),
    issuedAt: doc.issuedAt.toISOString(),
    status: doc.status,
    revokedAt: doc.revokedAt?.toISOString() ?? null,
    supersededAt: doc.supersededAt?.toISOString() ?? null,
    replaces: links.get(doc._id.toString())?.replaces ?? null,
    replacedBy: links.get(doc._id.toString())?.replacedBy ?? null,
    templateVersion: doc.templateVersion,
  }));
}

function verificationLinkFor(doc: { verificationTokenSealed?: string }): string | null {
  const config = getCertificateConfig();
  if (!config.ready || !doc.verificationTokenSealed) return null;
  const token = openToken(doc.verificationTokenSealed, config.key);
  return token ? verificationUrl(token, config.siteUrl) : null;
}

// ---------- Student ----------

export async function listOwnCertificates(actor: Actor): Promise<CertificateView[]> {
  assertStudent(actor);
  await connectToDatabase();
  const docs = await CertificateModel.find({ studentId: actor.id }).sort({ issuedAt: -1 }).limit(200).lean<CertificateDoc[]>();
  return toViews(docs);
}

/** The student's own certificate (another student's behaves like a missing one). */
export async function getOwnCertificate(actor: Actor, certificateId: string): Promise<(CertificateView & { verificationUrl: string | null }) | null> {
  assertStudent(actor);
  const id = normalizeCertificateId(certificateId);
  if (!id) return null;
  await connectToDatabase();
  const doc = await CertificateModel.findOne({ certificateId: id, studentId: actor.id }).select("+verificationTokenSealed").lean<CertificateDoc>();
  if (!doc) return null;
  const [view] = await toViews([doc]);
  return { ...view, verificationUrl: doc.status === "issued" ? verificationLinkFor(doc) : null };
}

// ---------- Admin ----------

export const CERTIFICATES_PAGE_SIZE = 25;

function paginate(total: number, requested: number | undefined) {
  const totalPages = Math.max(1, Math.ceil(total / CERTIFICATES_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(requested ?? 1) || 1), totalPages);
  return { totalPages, page, skip: (page - 1) * CERTIFICATES_PAGE_SIZE };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type AdminCertificateItem = CertificateView & { student: { id: string; email: string } };

export async function listCertificatesForAdmin(actor: Actor, filters: { q?: string; status?: string; programId?: string; page?: number } = {}) {
  assertAdmin(actor);
  await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (filters.status && (CERTIFICATE_STATUSES as readonly string[]).includes(filters.status)) query.status = filters.status;
  if (filters.programId && isValidObjectIdString(filters.programId)) query.programId = new Types.ObjectId(filters.programId);
  const q = filters.q?.trim().slice(0, 100);
  if (q) {
    const asId = normalizeCertificateId(q);
    if (asId) query.certificateId = asId;
    else {
      const pattern = new RegExp(escapeRegex(q), "i");
      const students = await UserModel.find({ role: "student", $or: [{ name: pattern }, { email: pattern }] }).select("_id").limit(500).lean();
      query.$or = [{ studentNameSnapshot: pattern }, { studentId: { $in: students.map((student) => student._id) } }];
    }
  }
  const total = await CertificateModel.countDocuments(query);
  const { totalPages, page, skip } = paginate(total, filters.page);
  const docs = await CertificateModel.find(query).sort({ issuedAt: -1, _id: -1 }).skip(skip).limit(CERTIFICATES_PAGE_SIZE).lean<CertificateDoc[]>();
  const [views, students] = await Promise.all([
    toViews(docs),
    UserModel.find({ _id: { $in: docs.map((doc) => doc.studentId) } }).select("email").lean(),
  ]);
  const emailOf = new Map(students.map((student) => [student._id.toString(), student.email]));
  return {
    total,
    totalPages,
    page,
    items: docs.map((doc, index): AdminCertificateItem => ({
      ...views[index],
      student: { id: doc.studentId.toString(), email: emailOf.get(doc.studentId.toString()) ?? "" },
    })),
  };
}

export type AdminCertificateDetail = CertificateView & {
  student: { id: string; name: string; email: string };
  programId: string;
  enrollmentId: string;
  issuedBy: string;
  revokedBy: string | null;
  revocationReason: string | null;
  correctionReason: string | null;
  verificationUrl: string | null;
};

export async function getCertificateForAdmin(actor: Actor, certificateId: string): Promise<AdminCertificateDetail | null> {
  assertAdmin(actor);
  const id = normalizeCertificateId(certificateId);
  if (!id) return null;
  await connectToDatabase();
  const doc = await CertificateModel.findOne({ certificateId: id }).select("+verificationTokenSealed").lean<CertificateDoc>();
  if (!doc) return null;
  const [[view], people] = await Promise.all([
    toViews([doc]),
    UserModel.find({ _id: { $in: [doc.studentId, doc.issuedBy, doc.revokedBy].filter(Boolean) } }).select("name email").lean(),
  ]);
  const person = new Map(people.map((item) => [item._id.toString(), item]));
  const student = person.get(doc.studentId.toString());
  return {
    ...view,
    student: { id: doc.studentId.toString(), name: student?.name ?? "Unknown student", email: student?.email ?? "" },
    programId: doc.programId.toString(),
    enrollmentId: doc.enrollmentId.toString(),
    issuedBy: person.get(doc.issuedBy.toString())?.name ?? "Unknown administrator",
    revokedBy: doc.revokedBy ? (person.get(doc.revokedBy.toString())?.name ?? "Unknown administrator") : null,
    revocationReason: doc.revocationReason,
    correctionReason: doc.correctionReason,
    verificationUrl: doc.status === "issued" ? verificationLinkFor(doc) : null,
  };
}

export type IssueCandidate = {
  enrollmentId: string;
  student: { name: string; email: string };
  program: { id: string; title: string };
  enrollmentStatus: string;
  eligibility: Pick<EligibilityResult, "eligible" | "issues" | "progress" | "existingCertificateId">;
};

/** Enrolments with their eligibility, for the issuance page (evaluated live, never cached). */
export async function listIssueCandidates(
  actor: Actor,
  filters: { q?: string; programId?: string; completion?: "all" | "completed"; page?: number } = {},
) {
  assertAdmin(actor);
  await connectToDatabase();
  const query: Record<string, unknown> = { status: { $in: ["active", "completed"] } };
  if (filters.programId && isValidObjectIdString(filters.programId)) query.programId = new Types.ObjectId(filters.programId);
  const q = filters.q?.trim().slice(0, 100);
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    const students = await UserModel.find({ role: "student", $or: [{ name: pattern }, { email: pattern }] }).select("_id").limit(500).lean();
    query.studentId = { $in: students.map((student) => student._id) };
  }
  if (filters.completion === "completed") {
    // The cached snapshot narrows the list; every row is still re-checked live below.
    const done = await LearningProgressModel.find({ "snapshot.state": "requirements_completed" }).select("enrollmentId").limit(5_000).lean();
    query._id = { $in: done.map((item) => item.enrollmentId) };
  }
  const total = await EnrollmentModel.countDocuments(query);
  const { totalPages, page, skip } = paginate(total, filters.page);
  const enrollments = await EnrollmentModel.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(CERTIFICATES_PAGE_SIZE).lean();
  const [students, programs] = await Promise.all([
    UserModel.find({ _id: { $in: enrollments.map((item) => item.studentId) } }).select("name email").lean(),
    ProgramModel.find({ _id: { $in: enrollments.map((item) => item.programId) } }).select("title").lean(),
  ]);
  const studentBy = new Map(students.map((item) => [item._id.toString(), item]));
  const programBy = new Map(programs.map((item) => [item._id.toString(), item]));
  const items: IssueCandidate[] = [];
  for (const enrollment of enrollments) {
    const eligibility = await checkCertificateEligibility(enrollment._id.toString());
    const student = studentBy.get(enrollment.studentId.toString());
    items.push({
      enrollmentId: enrollment._id.toString(),
      student: { name: student?.name ?? "Unknown student", email: student?.email ?? "" },
      program: { id: enrollment.programId.toString(), title: programBy.get(enrollment.programId.toString())?.title ?? "Unknown program" },
      enrollmentStatus: enrollment.status,
      eligibility: {
        eligible: eligibility.eligible,
        issues: eligibility.issues,
        progress: eligibility.progress,
        existingCertificateId: eligibility.existingCertificateId,
      },
    });
  }
  return { total, totalPages, page, items };
}

// ---------- PDF ----------

/**
 * Builds the PDF on demand. Students: their own VALID certificates only.
 * Admins: any certificate (revoked/superseded copies are watermarked); audited.
 */
export async function getCertificatePdf(actor: Actor, certificateId: string): Promise<ServiceResult<{ filename: string; bytes: Uint8Array }>> {
  if (actor.role === "admin") await assertActiveAdmin(actor);
  else assertStudent(actor);
  const id = normalizeCertificateId(certificateId);
  if (!id) return fail("not_found", "Certificate not found.");
  await connectToDatabase();
  const doc = await CertificateModel.findOne(actor.role === "admin" ? { certificateId: id } : { certificateId: id, studentId: actor.id })
    .select("+verificationTokenSealed")
    .lean<CertificateDoc>();
  if (!doc) return fail("not_found", "Certificate not found.");
  if (actor.role !== "admin" && doc.status !== "issued") return fail("conflict", "This certificate is no longer valid and cannot be downloaded.");

  const config = getCertificateConfig();
  if (!config.ready) return fail("unavailable", "Certificate PDFs cannot be generated at the moment.");
  const token = openToken(doc.verificationTokenSealed, config.key);
  if (!token) {
    console.error("[certificates] stored verification token could not be decrypted (wrong CERTIFICATE_TOKEN_KEY?)");
    return fail("unavailable", "Certificate PDFs cannot be generated at the moment.");
  }

  const bytes = await renderCertificatePdf({
    certificateId: doc.certificateId,
    studentName: doc.studentNameSnapshot,
    programTitle: doc.programTitleSnapshot,
    completionDate: doc.completionDate,
    issuedAt: doc.issuedAt,
    verificationUrl: verificationUrl(token, config.siteUrl),
    templateVersion: doc.templateVersion,
    status: doc.status,
  });
  if (actor.role === "admin") {
    await recordAuditEvent({
      actorId: actor.id,
      action: "certificate.downloaded",
      entityType: "certificate",
      entityId: doc._id,
      metadata: { certificateId: doc.certificateId, status: doc.status },
    });
  }
  return { ok: true, data: { filename: `${doc.certificateId}.pdf`, bytes } };
}

// ---------- Public verification ----------

export type VerificationResult =
  | { state: "valid"; certificateId: string; studentName: string; programTitle: string; issuedAt: string; completionDate: string }
  | { state: "revoked"; certificateId: string; programTitle: string; revokedAt: string | null }
  | { state: "superseded"; certificateId: string; programTitle: string; supersededAt: string | null; replacementId: string | null }
  | { state: "not_found" }
  | { state: "unavailable" };

/** "Siddharth Pangul" -> "S. P." (for lookups by the guessable certificate number). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => `${[...part][0]?.toUpperCase() ?? ""}.`)
    .join(" ");
}

async function toVerification(doc: CertificateDoc | null, fullName: boolean): Promise<VerificationResult> {
  if (!doc) return { state: "not_found" };
  if (doc.status === "issued") {
    return {
      state: "valid",
      certificateId: doc.certificateId,
      studentName: fullName ? doc.studentNameSnapshot : initials(doc.studentNameSnapshot),
      programTitle: doc.programTitleSnapshot,
      issuedAt: doc.issuedAt.toISOString(),
      completionDate: doc.completionDate.toISOString(),
    };
  }
  if (doc.status === "revoked") {
    return { state: "revoked", certificateId: doc.certificateId, programTitle: doc.programTitleSnapshot, revokedAt: doc.revokedAt?.toISOString() ?? null };
  }
  // Point to the replacement only while the replacement itself is valid.
  const replacement = await CertificateModel.findOne({ supersedesCertificateId: doc._id, status: "issued" }).select("certificateId").lean();
  return {
    state: "superseded",
    certificateId: doc.certificateId,
    programTitle: doc.programTitleSnapshot,
    supersededAt: doc.supersededAt?.toISOString() ?? null,
    replacementId: replacement?.certificateId ?? null,
  };
}

/**
 * Resolves a QR-code token. Only a stored record establishes validity; a
 * database problem returns "unavailable" (never "valid" and never "not found").
 */
export async function verifyCertificateByToken(token: string): Promise<VerificationResult> {
  if (!isVerificationTokenFormat(token)) return { state: "not_found" };
  try {
    await connectToDatabase();
    const doc = await CertificateModel.findOne({ verificationTokenHash: hashVerificationToken(token) }).lean<CertificateDoc>();
    return await toVerification(doc, true);
  } catch {
    console.error("[certificates] verification lookup failed");
    return { state: "unavailable" };
  }
}

/** Lookup by the printed certificate number. Shows initials only, since numbers are sequential. */
export async function verifyCertificateById(certificateId: string): Promise<VerificationResult> {
  const id = normalizeCertificateId(certificateId);
  if (!id) return { state: "not_found" };
  try {
    await connectToDatabase();
    const doc = await CertificateModel.findOne({ certificateId: id }).lean<CertificateDoc>();
    return await toVerification(doc, false);
  } catch {
    console.error("[certificates] verification lookup failed");
    return { state: "unavailable" };
  }
}

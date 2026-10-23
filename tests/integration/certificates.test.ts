import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { freshModules } from "../helpers";

/* Certificate lifecycle against a real (throwaway) MongoDB. */

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), refresh: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const KEY = randomBytes(32);
const SITE = "https://certs.krushitech.example";

let server: MongoMemoryServer;
let certs: typeof import("@/lib/services/certificate-service");
let curriculum: typeof import("@/lib/services/curriculum-service");
let enrollments: typeof import("@/lib/services/enrollment-service");
let submissions: typeof import("@/lib/services/submission-service");
let learning: typeof import("@/lib/services/learning-service");
let tokens: typeof import("@/lib/certificates/token");
let M: {
  User: typeof import("@/models/user").UserModel;
  Program: typeof import("@/models/program").ProgramModel;
  Enrollment: typeof import("@/models/enrollment").EnrollmentModel;
  Certificate: typeof import("@/models/certificate").CertificateModel;
  Payment: typeof import("@/models/payment").PaymentModel;
  Task: typeof import("@/models/learning-task").LearningTaskModel;
  Module: typeof import("@/models/learning-module").LearningModuleModel;
  AuditLog: typeof import("@/models/audit-log").AuditLogModel;
  RateLimit: typeof import("@/models/rate-limit").RateLimitModel;
};

type Actor = { id: string; role: "student" | "admin" };
let admin: Actor;
let counter = 0;

const pkg = (slug: string) => ({
  program: {
    title: `Certificate Program ${slug}`,
    slug,
    shortDescription: "Short.",
    description: "Long.",
    category: "Web",
    difficulty: "beginner",
    duration: { weeks: 2, weeklyEffort: "2 hours" },
    deliveryFormat: "Online",
    price: 9900,
    learningOutcomes: ["Outcome"],
    prerequisites: [],
    audience: [],
    modules: [],
    completionCriteria: ["Complete every module and have the project accepted."],
    status: "published",
    availability: "open",
  },
  modules: [
    { slug: "intro", title: "Intro", content: "Read me." },
    {
      slug: "project",
      title: "Project",
      content: "Build it.",
      tasks: [
        { slug: "build", title: "Build", instructions: "Build a page.", taskType: "text", required: true, completionRule: "review" },
        { slug: "extra", title: "Extra", instructions: "Optional.", taskType: "text", required: false, completionRule: "submission" },
      ],
    },
  ],
});

async function student(name = "Siddharth Pangul"): Promise<Actor & { email: string }> {
  const email = `s${++counter}@example.com`;
  const doc = await M.User.create({ name, email, role: "student", passwordHash: "x".repeat(20) });
  return { id: doc._id.toString(), role: "student", email };
}

/** A program + an enrolled student who has (optionally) completed every requirement. */
async function setup(options: { complete?: boolean; name?: string } = {}) {
  const slug = `cert-program-${++counter}`;
  await curriculum.importProgramPackage(pkg(slug), { actorId: null, via: "cli" });
  const s = await student(options.name);
  const enrolled = await enrollments.createManualEnrollment({ email: s.email, programSlug: slug }, { actorId: admin.id, via: "admin" });
  if (!enrolled.ok) throw new Error("enrol failed");
  const program = (await M.Program.findOne({ slug }).lean())!;
  if (options.complete !== false) await complete(s, enrolled.enrollmentId, program._id.toString());
  return { student: s, enrollmentId: enrolled.enrollmentId, programId: program._id.toString(), slug };
}

async function complete(s: Actor, enrollmentId: string, programId: string) {
  const intro = (await M.Module.findOne({ programId, slug: "intro" }).lean())!;
  expect(await learning.markModuleRead(s, enrollmentId, intro._id.toString())).toMatchObject({ ok: true });
  const task = (await M.Task.findOne({ programId, slug: "build" }).lean())!;
  const submitted = await submissions.submitTaskAttempt(s, task._id.toString(), { submissionType: "text", textContent: "Here is my work." });
  if (!submitted.ok) throw new Error("submit failed");
  expect(await submissions.reviewSubmission(admin, submitted.data.submissionId, { status: "accepted", feedback: "Great." })).toMatchObject({ ok: true });
}

const issue = (enrollmentId: string, actor: Actor = admin) => certs.issueCertificate(actor, { enrollmentId, confirm: true });

async function tokenOf(certificateId: string): Promise<string> {
  const doc = await M.Certificate.findOne({ certificateId }).select("+verificationTokenSealed").lean();
  return tokens.openToken(doc!.verificationTokenSealed, KEY)!;
}

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await freshModules({
    MONGODB_URI: server.getUri(),
    MONGODB_DB_NAME: "krushitech_certificates_test",
    NODE_ENV: "test",
    SITE_URL: SITE,
    CERTIFICATE_TOKEN_KEY: KEY.toString("base64"),
  });
  certs = await import("@/lib/services/certificate-service");
  curriculum = await import("@/lib/services/curriculum-service");
  enrollments = await import("@/lib/services/enrollment-service");
  submissions = await import("@/lib/services/submission-service");
  learning = await import("@/lib/services/learning-service");
  tokens = await import("@/lib/certificates/token");
  M = {
    User: (await import("@/models/user")).UserModel,
    Program: (await import("@/models/program")).ProgramModel,
    Enrollment: (await import("@/models/enrollment")).EnrollmentModel,
    Certificate: (await import("@/models/certificate")).CertificateModel,
    Payment: (await import("@/models/payment")).PaymentModel,
    Task: (await import("@/models/learning-task")).LearningTaskModel,
    Module: (await import("@/models/learning-module")).LearningModuleModel,
    AuditLog: (await import("@/models/audit-log")).AuditLogModel,
    RateLimit: (await import("@/models/rate-limit")).RateLimitModel,
  };
  await (await import("@/lib/db/mongodb")).connectToDatabase();
  await Promise.all(Object.values(M).map((model) => model.init()));
  const adminDoc = await M.User.create({ name: "Ada Admin", email: "ada@example.com", role: "admin", passwordHash: "x".repeat(20) });
  admin = { id: adminDoc._id.toString(), role: "admin" };
});

afterAll(async () => {
  const db = await import("@/lib/db/mongodb");
  await (await db.connectToDatabase()).disconnect();
  await server?.stop();
});

describe("eligibility", () => {
  it("an enrolled (even paid) student who has not completed the requirements is not eligible", async () => {
    const { enrollmentId } = await setup({ complete: false });
    const result = await certs.checkCertificateEligibility(enrollmentId);
    expect(result.eligible).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("requirements_incomplete");
    expect(await issue(enrollmentId)).toMatchObject({ ok: false, error: "conflict" });
    expect(await M.Certificate.countDocuments({ enrollmentId })).toBe(0);
    expect(await M.AuditLog.countDocuments({ action: "certificate.issue_refused", entityId: new Types.ObjectId(enrollmentId) })).toBe(1);
  });

  it("a task awaiting review is not enough when the task requires review", async () => {
    const { student: s, enrollmentId, programId } = await setup({ complete: false });
    const intro = (await M.Module.findOne({ programId, slug: "intro" }).lean())!;
    await learning.markModuleRead(s, enrollmentId, intro._id.toString());
    const task = (await M.Task.findOne({ programId, slug: "build" }).lean())!;
    await submissions.submitTaskAttempt(s, task._id.toString(), { submissionType: "text", textContent: "Pending review." });
    const result = await certs.checkCertificateEligibility(enrollmentId);
    expect(result.eligible).toBe(false);
    expect(result.issues[0].message).toMatch(/awaiting review/);
  });

  it("uses trusted records only and reports clear reasons", async () => {
    const { enrollmentId, slug } = await setup();
    expect((await certs.checkCertificateEligibility(enrollmentId)).eligible).toBe(true);
    expect((await certs.checkCertificateEligibility(enrollmentId, { expectedStudentId: new Types.ObjectId().toString() })).issues[0].code).toBe(
      "student_mismatch",
    );
    await M.Program.updateOne({ slug }, { status: "draft" });
    expect((await certs.checkCertificateEligibility(enrollmentId)).issues.map((issue) => issue.code)).toContain("program_unpublished");
    await M.Program.updateOne({ slug }, { status: "published", completionCriteria: [] });
    expect((await certs.checkCertificateEligibility(enrollmentId)).issues.map((issue) => issue.code)).toContain("criteria_undefined");
    await M.Program.updateOne({ slug }, { completionCriteria: ["Done"] });
  });

  it("a paid enrolment needs its payment to still be confirmed (refunded = not eligible)", async () => {
    const { enrollmentId, student: s, programId } = await setup();
    const payment = await M.Payment.create({
      studentId: s.id,
      programId,
      provider: "razorpay",
      mode: "test",
      amount: 9900,
      currency: "INR",
      status: "refunded",
      idempotencyKey: `${"k".repeat(20)}${++counter}`,
    });
    await M.Enrollment.updateOne({ _id: enrollmentId }, { source: "payment", paymentId: payment._id });
    expect((await certs.checkCertificateEligibility(enrollmentId)).issues.map((issue) => issue.code)).toContain("payment_not_confirmed");
    await M.Payment.updateOne({ _id: payment._id }, { status: "paid" });
    expect((await certs.checkCertificateEligibility(enrollmentId)).eligible).toBe(true);
  });

  it("refuses names the template cannot print", async () => {
    const { enrollmentId } = await setup({ name: "सिद्धार्थ" });
    expect((await certs.checkCertificateEligibility(enrollmentId)).issues.map((issue) => issue.code)).toContain("unprintable_text");
  });
});

describe("issuance", () => {
  it("students cannot issue certificates (to themselves or anyone)", async () => {
    const { enrollmentId, student: s } = await setup();
    await expect(issue(enrollmentId, s)).rejects.toMatchObject({ code: "not_authorized" });
    // A suspended admin is refused too.
    const suspended = await M.User.create({ name: "Old Admin", email: `old${++counter}@x.io`, role: "admin", accountStatus: "suspended", passwordHash: "x".repeat(20) });
    await expect(issue(enrollmentId, { id: suspended._id.toString(), role: "admin" })).rejects.toMatchObject({ code: "not_authorized" });
    expect(await M.Certificate.countDocuments({ enrollmentId })).toBe(0);
  });

  it("issues with snapshots, a hashed token, the session admin as issuer, and an audit entry", async () => {
    const { enrollmentId, student: s, programId } = await setup();
    const result = await issue(enrollmentId);
    expect(result).toMatchObject({ ok: true });
    const certificateId = (result as { data: { certificateId: string } }).data.certificateId;
    expect(certificateId).toMatch(/^GL-\d{4}-\d{6}$/);
    const doc = (await M.Certificate.findOne({ certificateId }).select("+verificationTokenSealed").lean())!;
    expect(doc).toMatchObject({
      status: "issued",
      studentNameSnapshot: "Siddharth Pangul",
      studentId: new Types.ObjectId(s.id),
      programId: new Types.ObjectId(programId),
      issuedBy: new Types.ObjectId(admin.id),
      templateVersion: 1,
    });
    const token = tokens.openToken(doc.verificationTokenSealed, KEY)!;
    expect(doc.verificationTokenHash).toBe(tokens.hashVerificationToken(token));
    expect(JSON.stringify(doc)).not.toContain(token);
    // Later profile edits do not change the issued certificate.
    await M.User.updateOne({ _id: s.id }, { name: "Renamed Person" });
    expect((await certs.getOwnCertificate(s, certificateId))?.studentName).toBe("Siddharth Pangul");
    // The completion date comes from the accepted review, not the issue time.
    expect(doc.completionDate.getTime()).toBeLessThanOrEqual(doc.issuedAt.getTime());
    expect(await M.AuditLog.countDocuments({ action: "certificate.issued", entityId: doc._id, actorId: new Types.ObjectId(admin.id) })).toBe(1);
  });

  it("repeated and concurrent issuance for one enrolment creates exactly one certificate", async () => {
    const { enrollmentId } = await setup();
    const results = await Promise.all(Array.from({ length: 6 }, () => issue(enrollmentId)));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await issue(enrollmentId)).toMatchObject({ ok: false, error: "conflict" });
    expect(await M.Certificate.countDocuments({ enrollmentId, status: "issued" })).toBe(1);
  });

  it("numbers stay unique under concurrent issuance for different enrolments", async () => {
    const setups = await Promise.all(Array.from({ length: 8 }, () => setup()));
    const results = await Promise.all(setups.map((item) => issue(item.enrollmentId)));
    const ids = results.map((result) => (result.ok ? result.data.certificateId : "FAILED"));
    expect(ids).not.toContain("FAILED");
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("verification", () => {
  it("valid token → full record; by ID → initials only; unknown → not found; no private data", async () => {
    const { enrollmentId, student: s } = await setup();
    const issued = await issue(enrollmentId);
    const certificateId = issued.ok ? issued.data.certificateId : "";
    const token = await tokenOf(certificateId);
    const byToken = await certs.verifyCertificateByToken(token);
    expect(byToken).toMatchObject({ state: "valid", certificateId, studentName: "Siddharth Pangul" });
    const byId = await certs.verifyCertificateById(certificateId.toLowerCase());
    expect(byId).toMatchObject({ state: "valid", studentName: "S. P." });
    for (const result of [byToken, byId]) {
      const json = JSON.stringify(result);
      expect(json).not.toContain(s.email);
      expect(json).not.toContain(s.id);
      expect(json).not.toContain(enrollmentId);
      expect(Object.keys(result).sort()).toEqual(["certificateId", "completionDate", "issuedAt", "programTitle", "state", "studentName"]);
    }
    expect(await certs.verifyCertificateByToken(tokens.generateVerificationToken())).toEqual({ state: "not_found" });
    expect(await certs.verifyCertificateByToken("not-a-token")).toEqual({ state: "not_found" });
    expect(await certs.verifyCertificateById("KT-1999-000001")).toEqual({ state: "not_found" });
    // The readable number is not the secret: it does not work as a token.
    expect(await certs.verifyCertificateByToken(certificateId)).toEqual({ state: "not_found" });
  });

  it("the QR link points to the configured public URL", async () => {
    const { enrollmentId, student: s } = await setup();
    const issued = await issue(enrollmentId);
    const certificateId = issued.ok ? issued.data.certificateId : "";
    const own = await certs.getOwnCertificate(s, certificateId);
    expect(own?.verificationUrl).toBe(`${SITE}/verify/${await tokenOf(certificateId)}`);
  });

  it("a database failure reports 'unavailable', never valid or not found", async () => {
    const spy = vi.spyOn(M.Certificate, "findOne").mockImplementationOnce(() => {
      throw new Error("connection lost");
    });
    expect(await certs.verifyCertificateByToken(tokens.generateVerificationToken())).toEqual({ state: "unavailable" });
    spy.mockRestore();
  });
});

describe("revocation and replacement", () => {
  it("revocation is admin-only, needs a reason, keeps the record, and shows immediately", async () => {
    const { enrollmentId, student: s } = await setup();
    const issued = await issue(enrollmentId);
    const certificateId = issued.ok ? issued.data.certificateId : "";
    await expect(certs.revokeCertificate(s, certificateId, { reason: "I want to revoke this one", confirm: true })).rejects.toMatchObject({
      code: "not_authorized",
    });
    expect(await certs.revokeCertificate(admin, certificateId, { reason: "short", confirm: true })).toMatchObject({ ok: false, error: "invalid" });
    expect(await certs.revokeCertificate(admin, certificateId, { reason: "Plagiarised project confirmed.", confirm: true })).toMatchObject({ ok: true });
    const result = await certs.verifyCertificateByToken(await tokenOf(certificateId));
    expect(result).toMatchObject({ state: "revoked", certificateId });
    expect(JSON.stringify(result)).not.toContain("Plagiarised");
    expect(await certs.revokeCertificate(admin, certificateId, { reason: "Plagiarised project confirmed.", confirm: true })).toMatchObject({
      ok: false,
      error: "conflict",
    });
    expect(await M.Certificate.countDocuments({ certificateId })).toBe(1);
    // A revoked enrolment cannot simply be issued again.
    expect((await certs.checkCertificateEligibility(enrollmentId)).issues.map((issue) => issue.code)).toContain("previously_revoked");
    // Students cannot download a revoked certificate.
    expect(await certs.getCertificatePdf(s, certificateId)).toMatchObject({ ok: false, error: "conflict" });
  });

  it("replacement supersedes the original, keeps history, and issues a new number and token", async () => {
    const { enrollmentId, student: s } = await setup({ name: "Sidharth Pangul" });
    const issued = await issue(enrollmentId);
    const oldId = issued.ok ? issued.data.certificateId : "";
    const oldToken = await tokenOf(oldId);
    await M.User.updateOne({ _id: s.id }, { name: "Siddharth Pangul" });
    const replaced = await certs.replaceCertificate(admin, oldId, { reason: "Name spelling corrected by the student.", confirm: true });
    expect(replaced).toMatchObject({ ok: true });
    const newId = replaced.ok ? replaced.data.certificateId : "";
    expect(newId).not.toBe(oldId);
    const [oldDoc, newDoc] = await Promise.all([M.Certificate.findOne({ certificateId: oldId }).lean(), M.Certificate.findOne({ certificateId: newId }).lean()]);
    expect(oldDoc).toMatchObject({ status: "superseded", supersededByCertificateId: newDoc!._id, studentNameSnapshot: "Sidharth Pangul" });
    expect(newDoc).toMatchObject({ status: "issued", supersedesCertificateId: oldDoc!._id, studentNameSnapshot: "Siddharth Pangul" });
    expect(newDoc!.completionDate.getTime()).toBe(oldDoc!.completionDate.getTime());
    expect(newDoc!.verificationTokenHash).not.toBe(oldDoc!.verificationTokenHash);
    expect(await certs.verifyCertificateByToken(oldToken)).toMatchObject({ state: "superseded", replacementId: newId });
    expect(await certs.verifyCertificateByToken(await tokenOf(newId))).toMatchObject({ state: "valid", studentName: "Siddharth Pangul" });
    const actions = (await M.AuditLog.find({ entityId: { $in: [oldDoc!._id, newDoc!._id] } }).lean()).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["certificate.issued", "certificate.superseded"]));
    // The superseded copy is listed for the student but not as current.
    const own = await certs.listOwnCertificates(s);
    expect(own.find((item) => item.certificateId === oldId)).toMatchObject({ status: "superseded", replacedBy: newId });
    // If the replacement is later revoked, the old one no longer points to it.
    await certs.revokeCertificate(admin, newId, { reason: "Revoked for testing purposes.", confirm: true });
    expect(await certs.verifyCertificateByToken(oldToken)).toMatchObject({ state: "superseded", replacementId: null });
  });
});

describe("PDF access", () => {
  it("owner gets a valid PDF; other students get not found; admins get it and are audited", async () => {
    const { enrollmentId, student: s } = await setup();
    const issued = await issue(enrollmentId);
    const certificateId = issued.ok ? issued.data.certificateId : "";
    const own = await certs.getCertificatePdf(s, certificateId);
    expect(own.ok).toBe(true);
    if (own.ok) {
      expect(own.data.filename).toBe(`${certificateId}.pdf`);
      expect((await PDFDocument.load(own.data.bytes)).getPageCount()).toBe(1);
    }
    const other = await student("Someone Else");
    expect(await certs.getCertificatePdf(other, certificateId)).toMatchObject({ ok: false, error: "not_found" });
    expect(await certs.getOwnCertificate(other, certificateId)).toBeNull();
    expect((await certs.listOwnCertificates(other)).length).toBe(0);
    expect((await certs.getCertificatePdf(admin, certificateId)).ok).toBe(true);
    expect(await M.AuditLog.countDocuments({ action: "certificate.downloaded" })).toBeGreaterThanOrEqual(1);
  });
});

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { freshModules, programInput } from "../helpers";

/* Analytics against a real (throwaway) MongoDB with known seeded data. */

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: "student" | "admin"; name: string; email: string; emailVerified: boolean } }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), refresh: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}), after: (fn: () => unknown) => void fn() }));
// Route tests: the session layer is replaced by a controllable stand-in (real auth is covered end-to-end).
vi.mock("@/lib/auth/session", () => ({
  authorizeApiRequest: async (role?: string) => {
    if (!session.user) return { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
    if (role && session.user.role !== role) return { response: Response.json({ error: "forbidden" }, { status: 403 }) };
    return { user: session.user };
  },
}));

const WEBHOOK_SECRET = "analytics_webhook_secret";
let server: MongoMemoryServer;
let analytics: typeof import("@/lib/services/analytics-service");
let exporter: typeof import("@/lib/services/analytics-export");
let operations: typeof import("@/lib/services/operations-service");
let payments: typeof import("@/lib/services/payment-service");
let period: typeof import("@/lib/analytics/period");
let M: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

type Actor = { id: string; role: "student" | "admin" };
let admin: Actor;
let student: Actor;
const ids: Record<string, Types.ObjectId> = {};

// Seed window: March 2025 (India time). 1 March 00:00 IST = 28 Feb 18:30 UTC.
const MARCH_START = new Date("2025-02-28T18:30:00.000Z");
const APRIL_START = new Date("2025-03-31T18:30:00.000Z");
const mid = new Date("2025-03-10T06:00:00.000Z");

function march() {
  const result = period.parseAnalyticsQuery({ period: "custom", from: "2025-03-01", to: "2025-03-31" });
  if (!result.ok) throw new Error(result.message);
  return result.query;
}
function withMode(mode: "live" | "test") {
  return { ...march(), mode };
}

async function payment(fields: Record<string, unknown>) {
  return M.Payment.create({
    studentId: ids.s1,
    programId: ids.web,
    provider: "razorpay",
    mode: "live",
    amount: 14900,
    currency: "INR",
    status: "paid",
    idempotencyKey: randomUUID(),
    paidAt: mid,
    createdAt: mid,
    ...fields,
  });
}

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await freshModules({
    MONGODB_URI: server.getUri(),
    MONGODB_DB_NAME: "krushitech_analytics_test",
    NODE_ENV: "test",
    PAYMENT_PROVIDER: "razorpay",
    PAYMENT_MODE: "live",
    PAYMENT_KEY_ID: "rzp_live_ANALYTICS",
    PAYMENT_KEY_SECRET: "analytics_key_secret",
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CERTIFICATE_TOKEN_KEY: randomBytes(32).toString("base64"),
  });
  analytics = await import("@/lib/services/analytics-service");
  exporter = await import("@/lib/services/analytics-export");
  operations = await import("@/lib/services/operations-service");
  payments = await import("@/lib/services/payment-service");
  period = await import("@/lib/analytics/period");
  M = {
    User: (await import("@/models/user")).UserModel,
    Program: (await import("@/models/program")).ProgramModel,
    Enrollment: (await import("@/models/enrollment")).EnrollmentModel,
    Payment: (await import("@/models/payment")).PaymentModel,
    Progress: (await import("@/models/learning-progress")).LearningProgressModel,
    Submission: (await import("@/models/submission")).SubmissionModel,
    Certificate: (await import("@/models/certificate")).CertificateModel,
    Module: (await import("@/models/learning-module")).LearningModuleModel,
    AuditLog: (await import("@/models/audit-log")).AuditLogModel,
  };
  await (await import("@/lib/db/mongodb")).connectToDatabase();
  await Promise.all(Object.values(M).map((model) => model.init()));

  const user = (name: string, role: string, createdAt: Date) =>
    M.User.create({ name, email: `${name.toLowerCase().replace(/\W/g, "")}${randomUUID().slice(0, 6)}@example.com`, role, passwordHash: "x".repeat(20), createdAt });
  const adminDoc = await user("Ada Admin", "admin", mid);
  admin = { id: adminDoc._id.toString(), role: "admin" };
  // Students at the period boundaries: start (in), just before start (out), exactly at the end (out).
  ids.s1 = (await user("Student One", "student", MARCH_START))._id;
  ids.s2 = (await user("Student Two", "student", mid))._id;
  ids.before = (await user("Before", "student", new Date(MARCH_START.getTime() - 1)))._id;
  ids.after = (await user("After", "student", APRIL_START))._id;
  student = { id: ids.s2.toString(), role: "student" };

  ids.web = (await M.Program.create(programInput({ slug: "web", title: "=HYPERLINK(\"http://evil\")", status: "published", availability: "open", price: 14900 })))._id;
  ids.old = (await M.Program.create(programInput({ slug: "old", title: "Archived Program", status: "archived", price: 9900 })))._id;
  ids.mod = (await M.Module.create({ programId: ids.web, slug: "m1", title: "Module 1", order: 0, isPublished: true }))._id;

  // Enrolments created in March: web → 2 active (1 met), 1 cancelled, 1 pending; old (archived) → 1 active met.
  const enrol = (studentId: Types.ObjectId, programId: Types.ObjectId, status: string, source = "manual") =>
    M.Enrollment.create({ studentId, programId, status, source, enrolledAt: mid, createdAt: mid });
  ids.e1 = (await enrol(ids.s1, ids.web, "active", "payment"))._id;
  ids.e2 = (await enrol(ids.s2, ids.web, "active"))._id;
  await enrol(ids.before, ids.web, "cancelled");
  await enrol(ids.after, ids.web, "pending");
  ids.e3 = (await enrol(ids.s2, ids.old, "active"))._id;
  const snapshot = (state: string, done: Types.ObjectId[] = []) => ({ completedModuleIds: done, completedTaskIds: [], totalModules: 1, percent: state === "requirements_completed" ? 100 : 0, state, computedAt: mid });
  await M.Progress.create({ studentId: ids.s1, enrollmentId: ids.e1, programId: ids.web, snapshot: snapshot("requirements_completed", [ids.mod]) });
  await M.Progress.create({ studentId: ids.s2, enrollmentId: ids.e2, programId: ids.web, snapshot: snapshot("in_progress") });
  await M.Progress.create({ studentId: ids.s2, enrollmentId: ids.e3, programId: ids.old, snapshot: snapshot("requirements_completed") });

  // Payments: only confirmed ones are revenue; currencies and modes are kept apart.
  await payment({ amount: 14900 });
  await payment({ amount: 20000, status: "partially_refunded" }); // money was collected
  await payment({ amount: 5000, currency: "USD" });
  await payment({ amount: 99900, mode: "test" });
  await payment({ status: "pending", paidAt: null, studentId: new Types.ObjectId() });
  await payment({ status: "failed", paidAt: null, studentId: new Types.ObjectId() });
  await payment({ status: "created", paidAt: null, studentId: new Types.ObjectId() });
  await payment({ status: "authorized", paidAt: null, studentId: new Types.ObjectId() });
  await payment({ amount: 77700, paidAt: APRIL_START }); // paid exactly at the exclusive end → not in March
  // Inconsistent record (authorized, yet with a payment time): status decides, so it is never revenue.
  await payment({ amount: 123456, status: "authorized", paidAt: mid, studentId: new Types.ObjectId() });
  await payment({ amount: 1, paidAt: MARCH_START, programId: ids.old }); // exactly at the start → in March

  // Submissions: three attempts on one task (two resubmissions) + one on another task.
  const submit = (attempt: number, status: string, reviewedAt: Date | null, taskId = ids.mod) =>
    M.Submission.create({
      studentId: ids.s1, enrollmentId: ids.e1, programId: ids.web, moduleId: ids.mod, taskId, attempt, submissionType: "text",
      textContent: "secret answer text", status, submittedAt: mid, reviewedAt,
    });
  const twoHours = new Date(mid.getTime() + 2 * 3_600_000);
  await submit(1, "changes_requested", twoHours);
  await submit(2, "rejected", new Date(mid.getTime() + 4 * 3_600_000));
  await submit(3, "submitted", null);
  await submit(1, "accepted", new Date(mid.getTime() + 6 * 3_600_000), new Types.ObjectId());

  // Certificates: one issued then revoked (old program), one valid (web).
  const cert = (n: number, programId: Types.ObjectId, enrollmentId: Types.ObjectId, extra: Record<string, unknown> = {}) =>
    M.Certificate.create({
      certificateId: `KT-2025-00000${n}`, verificationTokenHash: createHmac("sha256", "x").update(String(n)).digest("hex"), verificationTokenSealed: "v1.a.b.c",
      studentId: ids.s2, programId, enrollmentId, studentNameSnapshot: "Student Two", programTitleSnapshot: "Archived Program",
      completionDate: mid, issuedAt: mid, issuedBy: adminDoc._id, templateVersion: 1, ...extra,
    });
  await cert(1, ids.old, ids.e3, { status: "revoked", revokedAt: mid, revokedBy: adminDoc._id, revocationReason: "Copied work found." });
  await cert(2, ids.web, ids.e2);
});

afterAll(async () => {
  const db = await import("@/lib/db/mongodb");
  await (await db.connectToDatabase()).disconnect();
  await server?.stop();
});

describe("authorization", () => {
  it("students cannot read any report, export or operational status", async () => {
    const calls = [
      () => analytics.getOverviewReport(student, march()),
      () => analytics.getRevenueReport(student, march()),
      () => analytics.getProgramReport(student, march()),
      () => analytics.getLearningReport(student, march()),
      () => analytics.getCertificateReport(student, march()),
      () => exporter.exportReport(student, "programs", march()),
      () => operations.getOperationalStatus(student),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "not_authorized" });
  });

  it("API routes: 401 signed out, 403 for students, 400 for bad parameters, 200 for admins", async () => {
    const { GET } = await import("@/app/api/admin/analytics/revenue/route");
    const call = (query: string) => GET(new Request(`http://localhost/api/admin/analytics/revenue?${query}`));
    session.user = null;
    expect((await call("period=7d")).status).toBe(401);
    session.user = { id: student.id, role: "student", name: "S", email: "s@x.io", emailVerified: false };
    expect((await call("period=7d")).status).toBe(403);
    session.user = { id: admin.id, role: "admin", name: "A", email: "a@x.io", emailVerified: false };
    expect((await call("period=custom&from=2025-03-10&to=2025-03-01")).status).toBe(400);
    expect((await call("period=7d&$where=1")).status).toBe(400);
    const ok = await call("period=custom&from=2025-03-01&to=2025-03-31");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const body = JSON.stringify(await ok.json());
    expect(body).not.toMatch(/@example\.com|secret answer|rzp_|analytics_key_secret/);
    session.user = null;
  });
});

describe("revenue", () => {
  it("counts only confirmed payments, once each, per currency and per mode", async () => {
    const live = await analytics.getRevenueReport(admin, withMode("live"));
    expect(live.collected).toEqual([
      { currency: "INR", amount: 14900 + 20000 + 1, count: 3, average: Math.round((14900 + 20000 + 1) / 3) },
      { currency: "USD", amount: 5000, count: 1, average: 5000 },
    ]);
    const test = await analytics.getRevenueReport(admin, withMode("test"));
    expect(test.collected).toEqual([{ currency: "INR", amount: 99900, count: 1, average: 99900 }]);
    expect(live.refunds.available).toBe(false);
    expect(live.started).toMatchObject({ pending: 1, failed: 1, created: 1, authorized: 2 });
    const inrSeries = live.series.find((series) => series.currency === "INR")!;
    expect(inrSeries.points.reduce((sum, point) => sum + point.value, 0)).toBe(14900 + 20000 + 1);
    expect(inrSeries.points).toHaveLength(31); // every day of March
  });

  it("duplicate webhook deliveries do not double-count revenue", async () => {
    const pending = await payment({ status: "created", paidAt: null, providerOrderId: "order_dup", amount: 3000, createdAt: mid, studentId: new Types.ObjectId() });
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_dup", order_id: "order_dup", amount: 3000, currency: "INR", status: "captured" } } } });
    const headers = new Headers({ "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex"), "x-razorpay-event-id": "evt_dup" });
    await payments.processPaymentWebhook(raw, headers);
    await payments.processPaymentWebhook(raw, headers);
    await payments.processPaymentWebhook(raw, new Headers({ ...Object.fromEntries(headers), "x-razorpay-event-id": "evt_dup_2" }));
    const paid = await M.Payment.findById(pending._id).lean();
    expect(paid.status).toBe("paid");
    const today = period.parseAnalyticsQuery({ period: "today" });
    if (!today.ok) throw new Error("period");
    const report = await analytics.getRevenueReport(admin, today.query);
    expect(report.collected.find((item) => item.currency === "INR")).toMatchObject({ amount: 3000, count: 1 });
  });
});

describe("programs, learning and certificates", () => {
  it("program completion uses the documented denominator; archived programs keep history", async () => {
    const { rows } = await analytics.getProgramReport(admin, withMode("live"));
    const web = rows.find((row) => row.programId === ids.web.toString())!;
    expect(web.enrollments).toMatchObject({ total: 4, active: 2, cancelled: 1, pending: 1, paid: 1, manual: 3 });
    expect(web.requirementsMet).toBe(1);
    expect(web.completionRate).toBe(0.5); // 1 met ÷ 2 active (pending and cancelled excluded)
    expect(web.pendingSubmissions).toBe(1);
    const old = rows.find((row) => row.programId === ids.old.toString())!;
    expect(old.status).toBe("archived");
    expect(old.enrollments.total).toBe(1);
    expect(old.completionRate).toBe(1);
    expect(old.collected).toEqual([{ currency: "INR", amount: 1, count: 1 }]);
  });

  it("period boundaries: start included, end excluded, consecutive periods add up", async () => {
    const overview = await analytics.getOverviewReport(admin, march());
    expect(overview.period.newStudents).toBe(2); // s1 at the start + s2; not "before", not "after"
    const first = period.parseAnalyticsQuery({ period: "custom", from: "2025-03-01", to: "2025-03-09" });
    const second = period.parseAnalyticsQuery({ period: "custom", from: "2025-03-10", to: "2025-03-31" });
    if (!first.ok || !second.ok) throw new Error("period");
    const a = await analytics.getOverviewReport(admin, first.query);
    const b = await analytics.getOverviewReport(admin, second.query);
    expect(a.period.newStudents + b.period.newStudents).toBe(2);
  });

  it("submissions: resubmissions are not new tasks; review time is submission → decision", async () => {
    const learning = await analytics.getLearningReport(admin, march());
    expect(learning.submissions).toMatchObject({ attempts: 4, uniqueTasks: 2, resubmissions: 2 });
    expect(learning.reviews.decisions).toMatchObject({ changes_requested: 1, rejected: 1, accepted: 1 });
    expect(learning.reviews.averageHours).toBe(4); // (2 + 4 + 6) / 3
    expect(learning.reviews.medianHours).toBe(4);
    expect(learning.pendingNow).toMatchObject({ submissions: 1, students: 1 });
    expect(learning.progressStates).toMatchObject({ requirements_completed: 2, in_progress: 1 }); // + "not_calculated" for the new one
    // Met requirements: e1 (no certificate) counts; e3 has a revoked one (not re-issued automatically).
    expect(learning.certificateBacklog).toBe(1);
    // Current figure: includes the enrolment activated by the webhook test above (not a March cohort figure).
    const currentWeb = await M.Enrollment.countDocuments({ programId: ids.web, status: { $in: ["active", "completed"] } });
    expect(learning.modules.find((row) => row.moduleId === ids.mod.toString())).toMatchObject({ completed: 1, enrolled: currentWeb });
    expect(JSON.stringify(learning)).not.toContain("secret answer");
  });

  it("revoking a certificate does not erase its issuance", async () => {
    const report = await analytics.getCertificateReport(admin, march());
    expect(report.period).toMatchObject({ issued: 2, revoked: 1 });
    expect(report.lifetime).toMatchObject({ issuedEver: 2, valid: 1, revoked: 1 });
    expect(JSON.stringify(report)).not.toMatch(/verificationToken|Copied work/);
  });
});

describe("exports and operations", () => {
  it("CSV exports apply the same filters, neutralise formulas, contain no personal data, and are audited", async () => {
    const result = await exporter.exportReport(admin, "programs", withMode("live"));
    expect(result.filename).toBe("gradopus-labs-programs-live-2025-03-01-to-2025-03-31.csv");
    expect(result.csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(result.csv).not.toMatch(/@example\.com|Student One|secret|rzp_|v1\.a/);
    expect(await M.AuditLog.countDocuments({ action: "analytics.exported" })).toBe(1);
    const audit = await M.AuditLog.findOne({ action: "analytics.exported" }).lean();
    expect(audit.metadata).toMatchObject({ report: "programs", from: "2025-03-01", to: "2025-03-31", mode: "live" });
    expect(JSON.stringify(audit.metadata)).not.toContain("HYPERLINK");
  });

  it("operational status reveals no connection strings, hosts or secrets", async () => {
    const status = await operations.getOperationalStatus(admin);
    const text = JSON.stringify(status);
    expect(text).not.toMatch(/mongodb:\/\/|127\.0\.0\.1|localhost|analytics_key_secret|analytics_webhook_secret|rzp_live/);
    expect(status.indicators.find((item) => item.key === "database")?.status).toBe("healthy");
    expect(status.indicators.find((item) => item.key === "email")?.status).toBe("not_configured");
  });
});

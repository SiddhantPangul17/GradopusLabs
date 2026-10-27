import { readFileSync } from "node:fs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { freshModules } from "../helpers";

/*
 * Student learning area against a real (throwaway) MongoDB: isolation between
 * students, hidden drafts, submissions and history, reviews, progress and
 * profile rules. Content comes from docs/examples/sample-program.json.
 */

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), refresh: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

let server: MongoMemoryServer;
let curriculum: typeof import("@/lib/services/curriculum-service");
let enrollments: typeof import("@/lib/services/enrollment-service");
let learning: typeof import("@/lib/services/learning-service");
let submissions: typeof import("@/lib/services/submission-service");
let profile: typeof import("@/lib/services/profile-service");
let password: typeof import("@/lib/auth/password");
let models: {
  User: typeof import("@/models/user").UserModel;
  Enrollment: typeof import("@/models/enrollment").EnrollmentModel;
  Program: typeof import("@/models/program").ProgramModel;
  Module: typeof import("@/models/learning-module").LearningModuleModel;
  Task: typeof import("@/models/learning-task").LearningTaskModel;
  Submission: typeof import("@/models/submission").SubmissionModel;
  Progress: typeof import("@/models/learning-progress").LearningProgressModel;
  AuditLog: typeof import("@/models/audit-log").AuditLogModel;
};

type Actor = { id: string; role: "student" | "admin" };
let alice: Actor;
let bob: Actor;
const admin: Actor = { id: new Types.ObjectId().toString(), role: "admin" };
let aliceEnrollmentId: string;
const ids: Record<string, string> = {};

function samplePackage(overrides: { status?: string; dropModule?: string } = {}) {
  const pkg = JSON.parse(readFileSync("docs/examples/sample-program.json", "utf8"));
  pkg.program.status = overrides.status ?? "published";
  if (overrides.dropModule) pkg.modules = pkg.modules.filter((m: { slug: string }) => m.slug !== overrides.dropModule);
  return pkg;
}

async function createStudent(name: string, email: string): Promise<Actor> {
  const doc = await models.User.create({
    name,
    email,
    passwordHash: await password.hashPassword("original-password-123"),
    role: "student",
  });
  return { id: doc._id.toString(), role: "student" };
}

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await freshModules({ MONGODB_URI: server.getUri(), MONGODB_DB_NAME: "krushitech_learning_test", NODE_ENV: "test" });
  curriculum = await import("@/lib/services/curriculum-service");
  enrollments = await import("@/lib/services/enrollment-service");
  learning = await import("@/lib/services/learning-service");
  submissions = await import("@/lib/services/submission-service");
  profile = await import("@/lib/services/profile-service");
  password = await import("@/lib/auth/password");
  models = {
    User: (await import("@/models/user")).UserModel,
    Enrollment: (await import("@/models/enrollment")).EnrollmentModel,
    Program: (await import("@/models/program")).ProgramModel,
    Module: (await import("@/models/learning-module")).LearningModuleModel,
    Task: (await import("@/models/learning-task")).LearningTaskModel,
    Submission: (await import("@/models/submission")).SubmissionModel,
    Progress: (await import("@/models/learning-progress")).LearningProgressModel,
    AuditLog: (await import("@/models/audit-log")).AuditLogModel,
  };
  await (await import("@/lib/db/mongodb")).connectToDatabase();
  await Promise.all(Object.values(models).map((model) => model.init()));

  await curriculum.importProgramPackage(samplePackage(), { actorId: null, via: "cli" });
  for (const doc of await models.Module.find().lean()) ids[`module:${doc.slug}`] = doc._id.toString();
  for (const doc of await models.Task.find().lean()) ids[`task:${doc.slug}`] = doc._id.toString();

  alice = await createStudent("Alice", "alice@example.com");
  bob = await createStudent("Bob", "bob@example.com");
  const result = await enrollments.createManualEnrollment({ email: "alice@example.com", programSlug: "sample-program" }, { actorId: null, via: "cli" });
  if (!result.ok) throw new Error("enrollment failed");
  aliceEnrollmentId = result.enrollmentId;
});

afterAll(async () => {
  const db = await import("@/lib/db/mongodb");
  await (await db.connectToDatabase()).disconnect();
  await server?.stop();
});

const text = (textContent: string) => ({ submissionType: "text", textContent });
const link = (projectUrl: string) => ({ submissionType: "project_url", projectUrl });

describe("content import and operator enrollment", () => {
  it("re-importing keeps ids; removed modules are unpublished, not deleted", async () => {
    await curriculum.importProgramPackage(samplePackage(), { actorId: null, via: "cli" });
    expect((await models.Module.findOne({ slug: "getting-started" }).lean())?._id.toString()).toBe(ids["module:getting-started"]);

    const summary = await curriculum.importProgramPackage(samplePackage({ dropModule: "publishing" }), { actorId: null, via: "cli" });
    expect(summary.modules.unpublished).toBe(1);
    expect(await models.Module.countDocuments({ slug: "publishing" })).toBe(1);
    await curriculum.importProgramPackage(samplePackage(), { actorId: null, via: "cli" });
    expect((await models.Module.findOne({ slug: "publishing" }).lean())?.isPublished).toBe(true);
  });

  it("manual enrollments: audited, no payment implied, no duplicates, published programs only", async () => {
    const doc = await models.Enrollment.findById(aliceEnrollmentId).lean();
    expect(doc).toMatchObject({ status: "active", source: "manual", amountPaid: 0 });
    expect(await models.AuditLog.countDocuments({ action: "enrollment.created" })).toBe(1);
    expect(await enrollments.createManualEnrollment({ email: "alice@example.com", programSlug: "sample-program" }, { actorId: null, via: "cli" }))
      .toEqual({ ok: false, reason: "already_enrolled" });
    expect(await enrollments.createManualEnrollment({ email: "bob@example.com", programSlug: "nope" }, { actorId: null, via: "cli" }))
      .toEqual({ ok: false, reason: "program_not_found" });
  });
});

describe("isolation between students", () => {
  it("each student only sees their own enrollments", async () => {
    expect((await learning.listStudentEnrollments(alice)).map((e) => e.id)).toEqual([aliceEnrollmentId]);
    expect(await learning.listStudentEnrollments(bob)).toEqual([]);
  });

  it("another student's enrollment, modules and tasks behave as not found", async () => {
    expect(await learning.getEnrollmentLearning(bob, aliceEnrollmentId)).toMatchObject({ ok: false, error: "not_found" });
    expect(await learning.getModuleLearning(bob, aliceEnrollmentId, ids["module:getting-started"]!)).toMatchObject({ ok: false, error: "not_found" });
    expect(await submissions.getTaskPage(bob, ids["task:explain-semantic-html"]!)).toMatchObject({ ok: false, error: "not_found" });
    expect(await submissions.submitTaskAttempt(bob, ids["task:explain-semantic-html"]!, text("Sneaky"))).toMatchObject({ ok: false, error: "not_found" });
    expect(await learning.markModuleRead(bob, aliceEnrollmentId, ids["module:getting-started"]!)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("malformed ids are rejected safely", async () => {
    expect(await learning.getEnrollmentLearning(alice, "not-an-id")).toMatchObject({ ok: false, error: "not_found" });
    expect(await submissions.getTaskPage(alice, "{\"$ne\":null}")).toMatchObject({ ok: false, error: "not_found" });
  });

  it("admins cannot use student services (data-layer role check)", async () => {
    await expect(learning.listStudentEnrollments(admin)).rejects.toMatchObject({ code: "not_authorized" });
  });
});

describe("drafts are invisible to students", () => {
  it("draft modules and tasks are excluded everywhere", async () => {
    const outline = await learning.getEnrollmentLearning(alice, aliceEnrollmentId);
    if (!outline.ok) throw new Error("expected access");
    const moduleTitles = outline.data.modules.map((m) => m.title);
    const taskTitles = outline.data.modules.flatMap((m) => m.tasks.map((t) => t.title));
    expect(moduleTitles).toEqual(["Getting started", "Your first web page", "Publishing"]);
    expect(taskTitles).not.toContain("Draft task (hidden)");
    expect(outline.data.enrollment.progress?.totalModules).toBe(3);
    expect(await learning.getModuleLearning(alice, aliceEnrollmentId, ids["module:draft-module"]!)).toMatchObject({ error: "not_found" });
    expect(await submissions.getTaskPage(alice, ids["task:draft-task"]!)).toMatchObject({ error: "not_found" });
    expect(await submissions.submitTaskAttempt(alice, ids["task:draft-task"]!, text("x"))).toMatchObject({ error: "not_found" });
  });
});

describe("modules marked as read", () => {
  it("only reading modules; idempotent even under concurrency", async () => {
    expect(await learning.markModuleRead(alice, aliceEnrollmentId, ids["module:first-web-page"]!)).toMatchObject({ ok: false, error: "conflict" });
    const results = await Promise.all(Array.from({ length: 5 }, () => learning.markModuleRead(alice, aliceEnrollmentId, ids["module:getting-started"]!)));
    expect(results.every((r) => r.ok)).toBe(true);
    const progress = await models.Progress.find({ enrollmentId: aliceEnrollmentId }).lean();
    expect(progress).toHaveLength(1);
    expect(progress[0]!.readModules).toHaveLength(1);
  });
});

describe("submissions", () => {
  it("rejects invalid input, unsafe URLs, wrong types and file tasks", async () => {
    const taskId = ids["task:share-your-page"]!;
    expect(await submissions.submitTaskAttempt(alice, taskId, link("javascript:alert(1)"))).toMatchObject({ error: "invalid" });
    expect(await submissions.submitTaskAttempt(alice, taskId, link("http://example.com"))).toMatchObject({ error: "invalid" });
    expect(await submissions.submitTaskAttempt(alice, taskId, text("wrong type"))).toMatchObject({ error: "invalid" });
    expect(await submissions.submitTaskAttempt(alice, taskId, { ...link("https://example.com"), status: "accepted", score: 100 })).toMatchObject({ error: "invalid" });
    expect(await submissions.submitTaskAttempt(alice, ids["task:upload-screenshot"]!, { submissionType: "file" })).toMatchObject({ error: "invalid" });
    expect(await models.Submission.countDocuments()).toBe(0);
  });

  it("stores attempts as 'submitted' only, enforces the review wait, and keeps every attempt", async () => {
    const taskId = ids["task:explain-semantic-html"]!;
    const first = await submissions.submitTaskAttempt(alice, taskId, text("Semantic HTML describes meaning."));
    expect(first).toMatchObject({ ok: true, data: { attempt: 1 } });
    expect(await submissions.submitTaskAttempt(alice, taskId, text("Again"))).toMatchObject({ ok: false, error: "conflict" });

    const firstId = (first as { data: { submissionId: string } }).data.submissionId;
    expect(await submissions.reviewSubmission(admin, firstId, { status: "changes_requested", feedback: "Add a second example." })).toMatchObject({ ok: true });
    const second = await submissions.submitTaskAttempt(alice, taskId, text("Semantic HTML… with two examples."));
    expect(second).toMatchObject({ ok: true, data: { attempt: 2 } });

    const page = await submissions.getTaskPage(alice, taskId);
    if (!page.ok) throw new Error("expected task page");
    expect(page.data.attempts.map((a) => [a.attempt, a.status])).toEqual([
      [2, "submitted"],
      [1, "changes_requested"],
    ]);
    expect(page.data.attempts[1]!.feedback).toBe("Add a second example.");
    expect(page.data.state).toBe("awaiting_review");
  });

  it("concurrent double-submit creates exactly one attempt", async () => {
    const taskId = ids["task:final-project-link"]!;
    const results = await Promise.all([
      submissions.submitTaskAttempt(alice, taskId, link("https://example.com/final")),
      submissions.submitTaskAttempt(alice, taskId, link("https://example.com/final")),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error === "conflict")).toHaveLength(1);
    expect(await models.Submission.countDocuments({ taskId })).toBe(1);
  });

  it("'submission' tasks complete on submit and may be updated with a new attempt", async () => {
    const taskId = ids["task:share-your-page"]!;
    expect(await submissions.submitTaskAttempt(alice, taskId, link("https://alice.example.com"))).toMatchObject({ ok: true });
    expect(await submissions.submitTaskAttempt(alice, taskId, link("https://alice.example.com/v2"))).toMatchObject({ ok: true, data: { attempt: 2 } });
  });

  it("students never see each other's submissions", async () => {
    const own = await submissions.listOwnSubmissions(alice, 1);
    expect(own.total).toBeGreaterThan(0);
    const others = await submissions.listOwnSubmissions(bob, 1);
    expect(others).toMatchObject({ total: 0, items: [] });
  });
});

describe("reviews (admin only, valid transitions)", () => {
  it("students cannot review; invalid transitions are refused; reviews are audited", async () => {
    const latest = await models.Submission.findOne({ taskId: ids["task:explain-semantic-html"], attempt: 2 }).lean();
    const id = latest!._id.toString();
    await expect(submissions.reviewSubmission(alice, id, { status: "accepted", score: 100 })).rejects.toMatchObject({ code: "not_authorized" });
    expect(await submissions.reviewSubmission(admin, id, { status: "accepted", score: 92 })).toMatchObject({ ok: true });
    expect(await submissions.reviewSubmission(admin, id, { status: "rejected" })).toMatchObject({ ok: false, error: "conflict" });
    expect(await models.AuditLog.countDocuments({ action: "submission.reviewed" })).toBe(2);
  });
});

describe("progress and eligibility", () => {
  it("is calculated consistently everywhere and reaches 'requirements completed' only with accepted reviews", async () => {
    let outline = await learning.getEnrollmentLearning(alice, aliceEnrollmentId);
    if (!outline.ok) throw new Error("expected access");
    // Reading module read + module 2 complete (t1 accepted, t2 submitted); module 3 awaiting review.
    expect(outline.data.enrollment.progress).toMatchObject({ state: "awaiting_review", completedModules: 2, totalModules: 3, percent: 66 });

    const finalAttempt = await models.Submission.findOne({ taskId: ids["task:final-project-link"] }).lean();
    await submissions.reviewSubmission(admin, finalAttempt!._id.toString(), { status: "accepted" });

    outline = await learning.getEnrollmentLearning(alice, aliceEnrollmentId);
    if (!outline.ok) throw new Error("expected access");
    expect(outline.data.enrollment.progress).toMatchObject({ state: "requirements_completed", percent: 100, eligibleForCertificate: true });

    const dashboard = await learning.getStudentDashboard(alice);
    expect(dashboard.enrollments[0]!.progress).toEqual(outline.data.enrollment.progress);
    expect(dashboard.stats).toMatchObject({ activeEnrollments: 1, completedPrograms: 0, pendingTasks: 0, awaitingReview: 0 });

    const snapshot = (await models.Progress.findOne({ enrollmentId: aliceEnrollmentId }).lean())!.snapshot!;
    expect(snapshot).toMatchObject({ percent: 100, state: "requirements_completed", totalModules: 3 });
  });
});

describe("enrollment status and program status", () => {
  it("completed enrollment is read-only; archived keeps access; draft removes it", async () => {
    await models.Enrollment.updateOne({ _id: aliceEnrollmentId }, { $set: { status: "completed" } });
    expect(await submissions.submitTaskAttempt(alice, ids["task:optional-reflection"]!, text("Late thoughts"))).toMatchObject({ error: "forbidden" });
    expect((await learning.getEnrollmentLearning(alice, aliceEnrollmentId)) as { data: { enrollment: { access: string } } }).toMatchObject({
      data: { enrollment: { access: "read_only" } },
    });

    await models.Enrollment.updateOne({ _id: aliceEnrollmentId }, { $set: { status: "active" } });
    await models.Program.updateOne({ slug: "sample-program" }, { $set: { status: "archived" } });
    expect(await learning.getModuleLearning(alice, aliceEnrollmentId, ids["module:getting-started"]!)).toMatchObject({ ok: true });

    await models.Program.updateOne({ slug: "sample-program" }, { $set: { status: "draft" } });
    expect(await learning.getModuleLearning(alice, aliceEnrollmentId, ids["module:getting-started"]!)).toMatchObject({ ok: false, error: "forbidden" });
    expect(await submissions.getTaskPage(alice, ids["task:optional-reflection"]!)).toMatchObject({ ok: false, error: "not_found" });
    await models.Program.updateOne({ slug: "sample-program" }, { $set: { status: "published" } });
  });
});

describe("profile", () => {
  it("only the name can change; role and status cannot be set", async () => {
    expect(await profile.updateOwnProfile(alice, { name: "Alice A.", role: "admin" })).toMatchObject({ ok: false, error: "invalid" });
    expect(await profile.updateOwnProfile(alice, { name: "  Alice Anand  " })).toMatchObject({ ok: true, data: { name: "Alice Anand" } });
    const doc = await models.User.findById(alice.id).lean();
    expect(doc).toMatchObject({ name: "Alice Anand", role: "student", accountStatus: "active", email: "alice@example.com" });
  });

  it("password change needs the current password and ends all sessions", async () => {
    const before = (await models.User.findById(alice.id).select("+sessionVersion").lean())!.sessionVersion;
    const wrong = await profile.changeOwnPassword(alice, { currentPassword: "nope-nope-nope", newPassword: "brand-new-password-1", confirmPassword: "brand-new-password-1" });
    expect(wrong).toMatchObject({ ok: false, fieldErrors: { currentPassword: expect.any(String) } });
    expect(await profile.changeOwnPassword(alice, { currentPassword: "original-password-123", newPassword: "brand-new-password-1", confirmPassword: "brand-new-password-1" }))
      .toMatchObject({ ok: true });
    const after = await models.User.findById(alice.id).select("+sessionVersion +passwordHash").lean();
    expect(after!.sessionVersion).toBe(before + 1);
    expect(await password.verifyPassword(after!.passwordHash!, "brand-new-password-1")).toBe(true);
  });
});

import { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { freshModules } from "../helpers";

/* Admin services against a real (throwaway) MongoDB. */

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), refresh: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

let server: MongoMemoryServer;
let programs: typeof import("@/lib/services/admin-program-service");
let content: typeof import("@/lib/services/admin-content-service");
let reviews: typeof import("@/lib/services/admin-review-service");
let people: typeof import("@/lib/services/admin-people-service");
let audit: typeof import("@/lib/services/admin-audit-service");
let overview: typeof import("@/lib/services/admin-service");
let submissions: typeof import("@/lib/services/submission-service");
let learning: typeof import("@/lib/services/learning-service");
let publicPrograms: typeof import("@/lib/services/program-service");
let authService: typeof import("@/lib/services/auth-service");
let password: typeof import("@/lib/auth/password");
let M: {
  User: typeof import("@/models/user").UserModel;
  Program: typeof import("@/models/program").ProgramModel;
  Module: typeof import("@/models/learning-module").LearningModuleModel;
  Task: typeof import("@/models/learning-task").LearningTaskModel;
  Submission: typeof import("@/models/submission").SubmissionModel;
  Enrollment: typeof import("@/models/enrollment").EnrollmentModel;
  AuditLog: typeof import("@/models/audit-log").AuditLogModel;
  Progress: typeof import("@/models/learning-progress").LearningProgressModel;
};

type Actor = { id: string; role: "student" | "admin" };
let admin: Actor;
let student: Actor;
let programId = "";
const ids: Record<string, string> = {};

function programForm(overrides: Record<string, unknown> = {}) {
  return {
    title: "Admin Test Program",
    slug: "admin-test-program",
    shortDescription: "Short summary.",
    description: "Long description.",
    category: "Testing",
    difficulty: "beginner",
    duration: { weeks: 3, weeklyEffort: "3 hours" },
    deliveryFormat: "Online",
    price: 14900,
    currency: "INR",
    learningOutcomes: [],
    prerequisites: [],
    audience: [],
    modules: [],
    tasks: [],
    finalProject: "",
    inclusions: [],
    completionCriteria: [],
    availability: "coming-soon",
    featured: false,
    displayOrder: 0,
    ...overrides,
  };
}
const moduleForm = (title: string, slug: string, extra: Record<string, unknown> = {}) => ({
  title,
  slug,
  description: "",
  content: "Some content",
  estimatedDurationMinutes: null,
  isPublished: false,
  ...extra,
});
const taskForm = (title: string, slug: string, extra: Record<string, unknown> = {}) => ({
  title,
  slug,
  description: "",
  instructions: "Do the thing.",
  taskType: "text",
  required: true,
  completionRule: "review",
  dueDate: null,
  evaluationCriteria: ["Correct"],
  isPublished: true,
  ...extra,
});

async function makeUser(name: string, email: string, role: "student" | "admin"): Promise<Actor> {
  const doc = await M.User.create({ name, email, role, passwordHash: await password.hashPassword("a-good-password-1") });
  return { id: doc._id.toString(), role };
}

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await freshModules({ MONGODB_URI: server.getUri(), MONGODB_DB_NAME: "krushitech_admin_test", NODE_ENV: "test" });
  programs = await import("@/lib/services/admin-program-service");
  content = await import("@/lib/services/admin-content-service");
  reviews = await import("@/lib/services/admin-review-service");
  people = await import("@/lib/services/admin-people-service");
  audit = await import("@/lib/services/admin-audit-service");
  overview = await import("@/lib/services/admin-service");
  submissions = await import("@/lib/services/submission-service");
  learning = await import("@/lib/services/learning-service");
  publicPrograms = await import("@/lib/services/program-service");
  authService = await import("@/lib/services/auth-service");
  password = await import("@/lib/auth/password");
  M = {
    User: (await import("@/models/user")).UserModel,
    Program: (await import("@/models/program")).ProgramModel,
    Module: (await import("@/models/learning-module")).LearningModuleModel,
    Task: (await import("@/models/learning-task")).LearningTaskModel,
    Submission: (await import("@/models/submission")).SubmissionModel,
    Enrollment: (await import("@/models/enrollment")).EnrollmentModel,
    AuditLog: (await import("@/models/audit-log")).AuditLogModel,
    Progress: (await import("@/models/learning-progress")).LearningProgressModel,
  };
  await (await import("@/lib/db/mongodb")).connectToDatabase();
  await Promise.all(Object.values(M).map((model) => model.init()));
  admin = await makeUser("Ada Admin", "ada@example.com", "admin");
  student = await makeUser("Sam Student", "sam@example.com", "student");
});

afterAll(async () => {
  const db = await import("@/lib/db/mongodb");
  await (await db.connectToDatabase()).disconnect();
  await server?.stop();
});

describe("authorization", () => {
  it("every admin service refuses a student actor", async () => {
    const id = new Types.ObjectId().toString();
    const calls: (() => Promise<unknown>)[] = [
      () => programs.listProgramsForAdmin(student),
      () => programs.getProgramForAdmin(student, id),
      () => programs.createProgramAsAdmin(student, programForm()),
      () => programs.updateProgramAsAdmin(student, id, programForm()),
      () => programs.setProgramStatus(student, id, { target: "published", confirm: true }),
      () => content.listModulesForAdmin(student, id),
      () => content.createModule(student, id, moduleForm("M", "m")),
      () => content.createTask(student, id, id, taskForm("T", "t")),
      () => content.moveModule(student, id, id, "up"),
      () => reviews.listReviewQueue(student),
      () => reviews.getSubmissionForReview(student, id),
      () => reviews.decideSubmission(student, id, { status: "accepted", feedback: "", score: null }),
      () => reviews.updateReviewFeedback(student, id, { feedback: "x", score: null }),
      () => people.listStudents(student),
      () => people.setStudentAccountStatus(student, id, { status: "suspended", reason: "reason", confirm: true }),
      () => people.listEnrollments(student),
      () => people.createManualEnrollmentAsAdmin(student, { email: "a@b.co", programSlug: "x", confirmNoPayment: true }),
      () => audit.listAuditLogs(student),
      () => overview.getAdminOverview(student),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "not_authorized" });
  });
});

describe("programs", () => {
  it("validates input, normalises slugs and prevents duplicates; creates drafts only", async () => {
    expect(await programs.createProgramAsAdmin(admin, programForm({ price: -100 }))).toMatchObject({ ok: false, fieldErrors: { priceRupees: expect.any(String) } });
    expect(await programs.createProgramAsAdmin(admin, programForm({ duration: { weeks: 0, weeklyEffort: "x" } }))).toMatchObject({ ok: false, fieldErrors: { durationWeeks: expect.any(String) } });
    expect(await programs.createProgramAsAdmin(admin, programForm({ status: "published" }))).toMatchObject({ ok: false });

    const created = await programs.createProgramAsAdmin(admin, programForm());
    if (!created.ok) throw new Error("create failed");
    programId = created.data.id;
    expect((await M.Program.findById(programId).lean())?.status).toBe("draft");
    expect(await programs.createProgramAsAdmin(admin, programForm())).toMatchObject({ ok: false, fieldErrors: { slug: expect.stringMatching(/already used/) } });
    expect(await M.AuditLog.countDocuments({ action: "program.created", actorId: new Types.ObjectId(admin.id) })).toBe(1);
  });

  it("cannot publish until the checklist passes", async () => {
    const blocked = await programs.setProgramStatus(admin, programId, { target: "published", confirm: true });
    expect(blocked).toMatchObject({ ok: false, error: "conflict" });
    expect((blocked as { message: string }).message).toMatch(/learning outcome[\s\S]*completion criteria[\s\S]*module/);
    expect(await programs.setProgramStatus(admin, programId, { target: "published", confirm: false })).toMatchObject({ ok: false, error: "invalid" });
    expect(await publicPrograms.findPublishedPrograms()).toHaveLength(0);
  });

  it("modules and tasks: stable ids, scoped to the program, deterministic order", async () => {
    for (const [title, slug] of [["Intro", "intro"], ["Build", "build"], ["Ship", "ship"]] as const) {
      const result = await content.createModule(admin, programId, moduleForm(title, slug, { isPublished: true }));
      if (!result.ok) throw new Error("module");
      ids[slug] = result.data.id;
    }
    expect(await content.createModule(admin, programId, moduleForm("Dup", "intro"))).toMatchObject({ ok: false, fieldErrors: { slug: expect.any(String) } });

    await content.moveModule(admin, programId, ids.ship!, "up");
    const ordered = await M.Module.find({ programId }).sort({ order: 1 }).lean();
    expect(ordered.map((m) => m.slug)).toEqual(["intro", "ship", "build"]);
    expect(ordered.map((m) => m.order)).toEqual([0, 1, 2]);

    const other = await programs.createProgramAsAdmin(admin, programForm({ slug: "other-program", title: "Other" }));
    if (!other.ok) throw new Error("other");
    expect(await content.getModuleForAdmin(admin, other.data.id, ids.intro!)).toMatchObject({ ok: false, error: "not_found" });

    const task = await content.createTask(admin, programId, ids.build!, taskForm("Explain", "explain"));
    if (!task.ok) throw new Error("task");
    ids.task = task.data.id;
    expect(await content.createTask(admin, programId, ids.build!, taskForm("File", "file-task", { taskType: "file" }))).toMatchObject({ ok: false, fieldErrors: { taskType: expect.any(String) } });

    await content.updateModule(admin, programId, ids.build!, moduleForm("Build (renamed)", "build", { isPublished: true }));
    expect((await M.Module.findOne({ slug: "build" }).lean())?._id.toString()).toBe(ids.build);
  });

  it("publishes when ready, appears publicly, then locks the slug and protects completeness", async () => {
    await programs.updateProgramAsAdmin(admin, programId, programForm({ learningOutcomes: ["Build things"], completionCriteria: ["Finish the tasks"] }));
    expect(await programs.setProgramStatus(admin, programId, { target: "published", confirm: true })).toMatchObject({ ok: true });
    expect((await publicPrograms.findPublishedPrograms()).map((p) => p.slug)).toContain("admin-test-program");

    expect(await programs.updateProgramAsAdmin(admin, programId, programForm({ slug: "renamed", learningOutcomes: ["x"], completionCriteria: ["y"] })))
      .toMatchObject({ ok: false, fieldErrors: { slug: expect.stringMatching(/cannot change/) } });
    expect(await programs.updateProgramAsAdmin(admin, programId, programForm({ learningOutcomes: ["x"], completionCriteria: [] })))
      .toMatchObject({ ok: false, error: "conflict" });
  });

  it("refuses content changes that would break a published program, and rolls them back", async () => {
    for (const slug of ["intro", "ship"]) await content.setModulePublished(admin, programId, ids[slug]!, false);
    const result = await content.setModulePublished(admin, programId, ids.build!, false);
    expect(result).toMatchObject({ ok: false, error: "conflict" });
    expect((await M.Module.findById(ids.build).lean())?.isPublished).toBe(true);
    expect(await content.updateTask(admin, programId, ids.build!, ids.task!, taskForm("Explain", "explain", { instructions: "" })))
      .toMatchObject({ ok: false, error: "conflict" });
    expect((await M.Task.findById(ids.task).lean())?.instructions).toBe("Do the thing.");
  });
});

describe("reviews", () => {
  let first = "";
  it("queue shows pending work; feedback is required to request changes; reviewer comes from the session", async () => {
    const enroll = await people.createManualEnrollmentAsAdmin(admin, { email: "sam@example.com", programSlug: "admin-test-program", confirmNoPayment: true });
    expect(enroll).toMatchObject({ ok: true });
    const sub = await submissions.submitTaskAttempt(student, ids.task!, { submissionType: "text", textContent: "First answer" });
    if (!sub.ok) throw new Error("submit");
    first = sub.data.submissionId;

    const queue = await reviews.listReviewQueue(admin, { filter: "pending" });
    expect(queue.items.map((item) => item.id)).toContain(first);
    expect(queue.items[0]).toMatchObject({ studentName: "Sam Student", taskTitle: "Explain" });

    expect(await reviews.decideSubmission(admin, first, { status: "changes_requested", feedback: "", score: null }))
      .toMatchObject({ ok: false, fieldErrors: { feedback: expect.any(String) } });
    expect(await reviews.decideSubmission(admin, first, { status: "changes_requested", feedback: "Please add an example.", score: null })).toMatchObject({ ok: true });
    expect((await M.Submission.findById(first).lean())?.reviewerId?.toString()).toBe(admin.id);
  });

  it("only the latest attempt can be decided; history is kept; final decisions cannot be reversed", async () => {
    const second = await submissions.submitTaskAttempt(student, ids.task!, { submissionType: "text", textContent: "Second answer with example" });
    if (!second.ok) throw new Error("second");
    expect(await reviews.decideSubmission(admin, first, { status: "accepted", feedback: "", score: null })).toMatchObject({ ok: false, error: "conflict" });
    expect(await reviews.decideSubmission(admin, second.data.submissionId, { status: "accepted", feedback: "Good.", score: 88 })).toMatchObject({ ok: true });
    expect(await reviews.decideSubmission(admin, second.data.submissionId, { status: "rejected", feedback: "Changed my mind entirely.", score: null }))
      .toMatchObject({ ok: false, error: "conflict" });

    const detail = await reviews.getSubmissionForReview(admin, second.data.submissionId);
    if (!detail.ok) throw new Error("detail");
    expect(detail.data.history.map((h) => [h.attempt, h.status])).toEqual([[2, "accepted"], [1, "changes_requested"]]);
    expect(detail.data.allowedDecisions).toEqual([]);

    expect(await reviews.updateReviewFeedback(admin, second.data.submissionId, { feedback: "Good work overall.", score: 90 })).toMatchObject({ ok: true });
    expect((await M.Submission.findById(second.data.submissionId).lean())).toMatchObject({ status: "accepted", score: 90, feedback: "Good work overall." });
    expect(await M.AuditLog.countDocuments({ action: "submission.feedback_updated" })).toBe(1);

    const enrollment = await M.Enrollment.findOne({ studentId: new Types.ObjectId(student.id) }).lean();
    const outline = await learning.getEnrollmentLearning(student, enrollment!._id.toString());
    if (!outline.ok) throw new Error("outline");
    expect(outline.data.enrollment.progress?.state).toBe("requirements_completed");
  });

  it("an older, still-open attempt cannot be decided once a newer one exists", async () => {
    // "Submission" tasks let students resubmit while the previous attempt is still "submitted".
    const task = await content.createTask(admin, programId, ids.build!, taskForm("Share link", "share-link", { taskType: "project_url", completionRule: "submission", required: false }));
    if (!task.ok) throw new Error("task");
    const one = await submissions.submitTaskAttempt(student, task.data.id, { submissionType: "project_url", projectUrl: "https://example.com/v1" });
    const two = await submissions.submitTaskAttempt(student, task.data.id, { submissionType: "project_url", projectUrl: "https://example.com/v2" });
    if (!one.ok || !two.ok) throw new Error("submit");
    const result = await reviews.decideSubmission(admin, one.data.submissionId, { status: "accepted", feedback: "", score: null });
    expect(result).toMatchObject({ ok: false, error: "conflict" });
    expect((result as { message: string }).message).toMatch(/latest attempt/);
    expect((await reviews.getSubmissionForReview(admin, one.data.submissionId)) as { data: { isLatest: boolean; allowedDecisions: string[] } })
      .toMatchObject({ data: { isLatest: false, allowedDecisions: [] } });
  });

  it("task type is locked once there are submissions", async () => {
    expect(await content.updateTask(admin, programId, ids.build!, ids.task!, taskForm("Explain", "explain", { taskType: "project_url" })))
      .toMatchObject({ ok: false, fieldErrors: { taskType: expect.any(String) } });
  });

  it("queue pagination is bounded", async () => {
    const docs = Array.from({ length: reviews.REVIEW_PAGE_SIZE + 3 }, (_, i) => ({
      studentId: new Types.ObjectId(),
      enrollmentId: new Types.ObjectId(),
      programId: new Types.ObjectId(programId),
      moduleId: new Types.ObjectId(ids.build),
      taskId: new Types.ObjectId(ids.task),
      attempt: 1,
      submissionType: "text",
      textContent: `answer ${i}`,
      status: "submitted",
      submittedAt: new Date(Date.now() - i * 1000),
    }));
    await M.Submission.insertMany(docs);
    const page1 = await reviews.listReviewQueue(admin, { filter: "pending" });
    expect(page1.items).toHaveLength(reviews.REVIEW_PAGE_SIZE);
    expect(page1.totalPages).toBe(2);
    const page2 = await reviews.listReviewQueue(admin, { filter: "pending", page: 99 });
    expect(page2.page).toBe(2);
    // +2 still-open attempts from the "older attempt" test above
    expect(page2.items).toHaveLength(5);
  });
});

describe("students and enrollments", () => {
  it("search treats input literally and never returns credentials", async () => {
    const list = await people.listStudents(admin, { q: "sam" });
    expect(list.items.map((s) => s.email)).toEqual(["sam@example.com"]);
    expect(JSON.stringify(list)).not.toMatch(/passwordHash|sessionVersion|argon/);
    expect((await people.listStudents(admin, { q: ".*" })).total).toBe(0);
    expect((await people.listStudents(admin, { q: "(unclosed[" })).total).toBe(0);
  });

  it("suspension needs a reason, ends access, is audited and reversible; admins cannot be suspended here", async () => {
    expect(await people.setStudentAccountStatus(admin, student.id, { status: "suspended", reason: "x", confirm: true })).toMatchObject({ ok: false });
    expect(await people.setStudentAccountStatus(admin, admin.id, { status: "suspended", reason: "testing self", confirm: true })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await people.setStudentAccountStatus(admin, student.id, { status: "suspended", reason: "Repeated plagiarism", confirm: true })).toMatchObject({ ok: true });
    expect(await authService.authenticateWithPassword("sam@example.com", "a-good-password-1")).toMatchObject({ ok: false, reason: "account_inactive" });
    const entry = await M.AuditLog.findOne({ action: "user.status_changed" }).lean();
    expect(entry?.metadata).toMatchObject({ from: "active", to: "suspended", reason: "Repeated plagiarism" });
    expect(await people.setStudentAccountStatus(admin, student.id, { status: "active", reason: "Appeal accepted", confirm: true })).toMatchObject({ ok: true });
    expect(await authService.authenticateWithPassword("sam@example.com", "a-good-password-1")).toMatchObject({ ok: true });
  });

  it("manual enrollments record no payment and the admin as actor", async () => {
    const list = await people.listEnrollments(admin, { status: "active" });
    expect(list.items[0]).toMatchObject({ source: "manual", amountPaid: 0, student: { email: "sam@example.com" } });
    const entry = await M.AuditLog.findOne({ action: "enrollment.created" }).lean();
    expect(entry).toMatchObject({ actorId: new Types.ObjectId(admin.id), metadata: { via: "admin", source: "manual" } });
    expect(await people.createManualEnrollmentAsAdmin(admin, { email: "sam@example.com", programSlug: "admin-test-program", confirmNoPayment: true }))
      .toMatchObject({ ok: false, error: "conflict" });
  });
});

describe("archive, audit log and overview", () => {
  it("archiving hides the program publicly but enrolled students keep access", async () => {
    expect(await programs.setProgramStatus(admin, programId, { target: "archived", confirm: true })).toMatchObject({ ok: true });
    expect((await publicPrograms.findPublishedPrograms()).map((p) => p.slug)).not.toContain("admin-test-program");
    const enrollment = await M.Enrollment.findOne({ studentId: new Types.ObjectId(student.id) }).lean();
    expect((await learning.getEnrollmentLearning(student, enrollment!._id.toString())) as { data: { enrollment: { access: string } } })
      .toMatchObject({ data: { enrollment: { access: "full" } } });
    expect(await M.Program.countDocuments({ _id: programId })).toBe(1);
  });

  it("audit log lists newest first and filters by action", async () => {
    const all = await audit.listAuditLogs(admin);
    expect(all.items[0]!.action).toBe("program.archived");
    expect(all.items[0]!.actor).toBe("Ada Admin (ada@example.com)");
    const reviewed = await audit.listAuditLogs(admin, { action: "submission.reviewed" });
    expect(reviewed.items.every((item) => item.action === "submission.reviewed")).toBe(true);
    expect(reviewed.total).toBe(2);
  });

  it("overview reports real counts", async () => {
    const data = await overview.getAdminOverview(admin);
    expect(data).toMatchObject({ users: { student: 1, admin: 1 }, programs: { archived: 1, draft: 1, published: 0 }, activeEnrollments: 1 });
    expect(data.pendingSubmissions).toBe(reviews.REVIEW_PAGE_SIZE + 5);
    expect(JSON.stringify(data)).not.toMatch(/@example\.com",\s*"password/);
  });
});

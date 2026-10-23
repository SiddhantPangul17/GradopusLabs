import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { freshModules } from "../helpers";

/*
 * Emails and in-app notifications against a real (throwaway) MongoDB. The
 * email provider is replaced by a fake Resend API (stubbed fetch): no real
 * email is sent. after() runs its callback immediately but is collected so
 * tests can wait for background work.
 */

const background = vi.hoisted(() => ({ tasks: [] as Promise<unknown>[] }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), refresh: vi.fn() }));
vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
  after: (fn: () => Promise<unknown>) => {
    background.tasks.push(Promise.resolve().then(fn));
  },
}));
const flush = async () => {
  while (background.tasks.length > 0) await Promise.allSettled(background.tasks.splice(0));
};

const WEBHOOK_SECRET = "notify_webhook_secret_value";
const KEY = randomBytes(32);

// ---------- Fake Resend ----------
type Sent = { to: string; subject: string; html: string; text: string; idempotencyKey: string | null };
const resend = { mode: "ok" as "ok" | "fail500" | "fail422" | "network", sent: [] as Sent[], calls: 0 };
async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (!url.startsWith("https://api.resend.com/")) return Response.json({ error: "unexpected host" }, { status: 599 });
  resend.calls += 1;
  if (resend.mode === "network") throw new TypeError("fetch failed");
  if (resend.mode === "fail500") return Response.json({ statusCode: 500, name: "application_error", message: "boom" }, { status: 500 });
  if (resend.mode === "fail422") return Response.json({ statusCode: 422, name: "invalid_parameter", message: "bad" }, { status: 422 });
  const body = JSON.parse(String(init?.body));
  const key = new Headers(init?.headers).get("idempotency-key");
  // Like the provider: the same idempotency key is accepted once.
  if (!resend.sent.some((item) => item.idempotencyKey === key)) {
    resend.sent.push({ to: body.to[0], subject: body.subject, html: body.html, text: body.text, idempotencyKey: key });
  }
  return Response.json({ id: `email_${resend.sent.length}` });
}

let server: MongoMemoryServer;
let auth: typeof import("@/lib/services/auth-service");
let outbox: typeof import("@/lib/email/outbox");
let notifications: typeof import("@/lib/services/notification-service");
let adminEmails: typeof import("@/lib/services/admin-notification-service");
let payments: typeof import("@/lib/services/payment-service");
let enrollments: typeof import("@/lib/services/enrollment-service");
let submissions: typeof import("@/lib/services/submission-service");
let certs: typeof import("@/lib/services/certificate-service");
let curriculum: typeof import("@/lib/services/curriculum-service");
let M: {
  User: typeof import("@/models/user").UserModel;
  Program: typeof import("@/models/program").ProgramModel;
  Job: typeof import("@/models/email-job").EmailJobModel;
  Notification: typeof import("@/models/notification").NotificationModel;
  Payment: typeof import("@/models/payment").PaymentModel;
  Module: typeof import("@/models/learning-module").LearningModuleModel;
  Task: typeof import("@/models/learning-task").LearningTaskModel;
  RateLimit: typeof import("@/models/rate-limit").RateLimitModel;
};

type Actor = { id: string; role: "student" | "admin" };
let admin: Actor;
let n = 0;

async function register(email = `user${++n}@example.com`, name = "Sam Student") {
  const result = await auth.registerStudent(
    { name, email, password: "a-good-password-1", confirmPassword: "a-good-password-1", acceptTerms: true },
    { ip: `10.0.0.${++n % 250}` },
  );
  const user = await M.User.findOne({ email }).lean();
  return { result, user, actor: user ? ({ id: user._id.toString(), role: "student" } as Actor) : null, email };
}

type JobDoc = import("@/models/email-job").EmailJobRecord & { _id: Types.ObjectId };
const jobsOf = (userId: string, type?: string) =>
  M.Job.find({ userId: new Types.ObjectId(userId), ...(type ? { type } : {}) } as Record<string, unknown>).lean<JobDoc[]>();

function signedWebhook(event: string, entity: Record<string, unknown>, eventId: string) {
  const raw = JSON.stringify({ entity: "event", event, payload: { payment: { entity } } });
  return payments.processPaymentWebhook(
    raw,
    new Headers({ "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex"), "x-razorpay-event-id": eventId }),
  );
}

async function program(slug: string) {
  await curriculum.importProgramPackage(
    {
      program: {
        title: `Program ${slug}`,
        slug,
        shortDescription: "S",
        description: "D",
        category: "Web",
        difficulty: "beginner",
        duration: { weeks: 1, weeklyEffort: "1 hour" },
        deliveryFormat: "Online",
        price: 14900,
        learningOutcomes: ["O"],
        prerequisites: [],
        audience: [],
        modules: [],
        completionCriteria: ["Finish"],
        status: "published",
        availability: "open",
      },
      modules: [{ slug: "m", title: "Module", content: "x", tasks: [{ slug: "t", title: `Task <b>${slug}</b>`, instructions: "Do it", taskType: "text" }] }],
    },
    { actorId: null, via: "cli" },
  );
  return (await M.Program.findOne({ slug }).lean())!;
}

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await freshModules({
    MONGODB_URI: server.getUri(),
    MONGODB_DB_NAME: "krushitech_notifications_test",
    NODE_ENV: "test",
    SITE_URL: "https://krushitech.example",
    EMAIL_PROVIDER: "resend",
    EMAIL_API_KEY: "re_test_fake_key",
    EMAIL_FROM: "KrushiTech <noreply@mail.krushitech.example>",
    PAYMENT_PROVIDER: "razorpay",
    PAYMENT_MODE: "test",
    PAYMENT_KEY_ID: "rzp_test_NOTIFY",
    PAYMENT_KEY_SECRET: "notify_key_secret_value",
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CERTIFICATE_TOKEN_KEY: KEY.toString("base64"),
  });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  auth = await import("@/lib/services/auth-service");
  outbox = await import("@/lib/email/outbox");
  notifications = await import("@/lib/services/notification-service");
  adminEmails = await import("@/lib/services/admin-notification-service");
  payments = await import("@/lib/services/payment-service");
  enrollments = await import("@/lib/services/enrollment-service");
  submissions = await import("@/lib/services/submission-service");
  certs = await import("@/lib/services/certificate-service");
  curriculum = await import("@/lib/services/curriculum-service");
  M = {
    User: (await import("@/models/user")).UserModel,
    Program: (await import("@/models/program")).ProgramModel,
    Job: (await import("@/models/email-job")).EmailJobModel,
    Notification: (await import("@/models/notification")).NotificationModel,
    Payment: (await import("@/models/payment")).PaymentModel,
    Module: (await import("@/models/learning-module")).LearningModuleModel,
    Task: (await import("@/models/learning-task")).LearningTaskModel,
    RateLimit: (await import("@/models/rate-limit")).RateLimitModel,
  };
  await (await import("@/lib/db/mongodb")).connectToDatabase();
  await Promise.all(Object.values(M).map((model) => model.init()));
  const adminDoc = await M.User.create({ name: "Ada Admin", email: "ada@example.com", role: "admin", passwordHash: "x".repeat(20) });
  admin = { id: adminDoc._id.toString(), role: "admin" };
});

beforeEach(async () => {
  await flush();
  resend.mode = "ok";
  resend.sent = [];
  resend.calls = 0;
  await M.RateLimit.deleteMany({});
});

afterAll(async () => {
  await flush();
  vi.unstubAllGlobals();
  const db = await import("@/lib/db/mongodb");
  await (await db.connectToDatabase()).disconnect();
  await server?.stop();
});

describe("registration and password reset", () => {
  it("successful registration queues one welcome email and notification; failed registration queues nothing", async () => {
    const { result, user, email } = await register();
    expect(result).toEqual({ ok: true });
    await flush();
    expect(await jobsOf(user!._id.toString(), "welcome")).toMatchObject([{ status: "sent", attemptCount: 1 }]);
    expect(resend.sent.filter((item) => item.to === email)).toHaveLength(1);
    expect(resend.sent[0].text).not.toMatch(/verified/i);
    expect(await M.Notification.countDocuments({ userId: user!._id, type: "welcome" })).toBe(1);

    const before = await M.Job.countDocuments();
    expect((await register(email)).result).toMatchObject({ ok: false, reason: "email_taken" });
    expect(await auth.registerStudent({ name: "", email: "bad", password: "x" }, { ip: "1.1.1.1" })).toMatchObject({ ok: false, reason: "invalid" });
    await flush();
    expect(await M.Job.countDocuments()).toBe(before);
  });

  it("reset requests look identical for known and unknown emails; the token is never stored or logged", async () => {
    const { user, email } = await register();
    await flush();
    resend.sent = [];
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      }),
    );
    const known = await auth.requestPasswordReset(email, { ip: "9.9.9.1" });
    const unknown = await auth.requestPasswordReset(`nobody${++n}@example.com`, { ip: "9.9.9.2" });
    await flush();
    spies.forEach((spy) => spy.mockRestore());
    expect(known).toEqual(unknown);
    expect(resend.sent).toHaveLength(1);
    const link = resend.sent[0].text.match(/https:\/\/krushitech\.example\/reset-password\?token=([A-Za-z0-9_-]{43})/);
    expect(link).not.toBeNull();
    const token = link![1];
    const job = (await jobsOf(user!._id.toString(), "password_reset"))[0];
    expect(job).toMatchObject({ status: "sent" });
    expect(JSON.stringify(await M.Job.find().lean())).not.toContain(token);
    expect(logs.join("\n")).not.toContain(token);
    // The link works once; an invalid token never does.
    expect(await auth.resetPassword({ token: "x".repeat(43), password: "another-good-pass-1", confirmPassword: "another-good-pass-1" })).toMatchObject({
      ok: false,
      reason: "invalid_token",
    });
    expect(await auth.resetPassword({ token, password: "another-good-pass-1", confirmPassword: "another-good-pass-1" })).toEqual({ ok: true });
    expect(await auth.resetPassword({ token, password: "another-good-pass-2", confirmPassword: "another-good-pass-2" })).toMatchObject({ ok: false });
  });
});

describe("payments and enrolment", () => {
  async function paidFlow(slug: string, options: { archive?: boolean } = {}) {
    const p = await program(slug);
    const { actor } = await register();
    await flush();
    const paymentId = new Types.ObjectId();
    await M.Payment.create({
      _id: paymentId,
      studentId: actor!.id,
      programId: p._id,
      provider: "razorpay",
      mode: "test",
      providerOrderId: `order_${slug.replace(/-/g, "")}`,
      amount: 14900,
      currency: "INR",
      status: "created",
      idempotencyKey: randomUUID(),
    });
    if (options.archive) await M.Program.updateOne({ _id: p._id }, { status: "archived" });
    const entity = { id: `pay_${slug.replace(/-/g, "")}`, order_id: `order_${slug.replace(/-/g, "")}`, amount: 14900, currency: "INR", status: "captured" };
    return { actor: actor!, paymentId, entity };
  }

  it("payment confirmation is queued only after verified payment, once, even with duplicate webhooks", async () => {
    const { actor, paymentId, entity } = await paidFlow("pay-notify-a");
    expect(await jobsOf(actor.id, "payment_confirmation")).toHaveLength(0);
    // A failed attempt queues nothing.
    await signedWebhook("payment.failed", { ...entity, id: "pay_failedattempt", status: "failed" }, "evt_n_fail");
    expect(await jobsOf(actor.id, "payment_confirmation")).toHaveLength(0);
    await signedWebhook("payment.captured", entity, "evt_n_1");
    await signedWebhook("payment.captured", entity, "evt_n_1");
    await signedWebhook("order.paid", entity, "evt_n_2");
    await flush();
    const jobs = await jobsOf(actor.id, "payment_confirmation");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "sent", relatedEntityId: paymentId });
    expect(await jobsOf(actor.id, "enrollment_confirmation")).toMatchObject([{ status: "sent" }]);
    const sent = resend.sent.find((item) => item.subject.startsWith("Payment confirmed"))!;
    expect(sent.text).toContain("₹149");
    expect(sent.text).toContain(entity.id);
    expect(sent.text).not.toMatch(/notify_key_secret|notify_webhook_secret/);
    expect(await M.Notification.countDocuments({ userId: actor.id, type: { $in: ["payment_confirmed", "enrollment_confirmed"] } })).toBe(2);
  });

  it("no enrolment email when activation did not happen (program archived while pending)", async () => {
    const { actor, entity } = await paidFlow("pay-notify-b", { archive: true });
    await signedWebhook("payment.captured", entity, "evt_n_3");
    await flush();
    expect(await jobsOf(actor.id, "payment_confirmation")).toHaveLength(1);
    expect(await jobsOf(actor.id, "enrollment_confirmation")).toHaveLength(0);
  });

  it("an email provider outage never reverses the payment or enrolment; retries are bounded and reuse one idempotency key", async () => {
    resend.mode = "fail500";
    const { actor, paymentId, entity } = await paidFlow("pay-notify-c");
    expect((await signedWebhook("payment.captured", entity, "evt_n_4")).status).toBe(200);
    await flush();
    expect(await M.Payment.findById(paymentId).lean()).toMatchObject({ status: "paid" });
    const job = (await jobsOf(actor.id, "payment_confirmation"))[0];
    expect(job).toMatchObject({ status: "pending", attemptCount: 1, lastErrorCode: "application_error" });
    expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    // Make it due repeatedly until the attempts run out.
    const keys = new Set<string>();
    for (let attempt = 2; attempt <= outbox.MAX_ATTEMPTS + 1; attempt++) {
      await M.Job.updateMany({ status: "pending" }, { $set: { nextAttemptAt: new Date(0) } });
      await outbox.processEmailOutbox({ limit: 50 });
    }
    const final = await M.Job.findById(job._id).lean();
    expect(final).toMatchObject({ status: "failed", attemptCount: outbox.MAX_ATTEMPTS });
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    for (const [, init] of fetchMock.mock.calls) {
      const key = new Headers((init as RequestInit | undefined)?.headers).get("idempotency-key");
      if (key === `krushitech-email-${job._id.toString()}`) keys.add(key);
    }
    expect(keys.size).toBe(1);
    expect(await M.Job.countDocuments({ userId: new Types.ObjectId(actor.id), type: "payment_confirmation" })).toBe(1);
    // Admin retry re-queues the same job; it is then delivered once.
    resend.mode = "ok";
    expect(await adminEmails.retryEmailJob(admin, job._id.toString())).toEqual({ ok: true, data: null });
    await flush();
    await outbox.processEmailOutbox({ limit: 50 });
    expect(await M.Job.findById(job._id).lean()).toMatchObject({ status: "sent" });
    expect(resend.sent.filter((item) => item.idempotencyKey === `krushitech-email-${job._id.toString()}`)).toHaveLength(1);
  });

  it("permanent provider errors stop immediately; concurrent processors never send a job twice", async () => {
    resend.mode = "fail422";
    const { actor } = await register();
    await flush();
    expect((await jobsOf(actor!.id, "welcome"))[0]).toMatchObject({ status: "failed", attemptCount: 1, lastErrorCode: "invalid_parameter" });

    resend.mode = "ok";
    const users = await Promise.all(Array.from({ length: 6 }, async () => (await M.User.create({ name: "P", email: `p${++n}@example.com`, role: "student", passwordHash: "x".repeat(20) }))._id));
    // Inserted directly (no automatic processing), then raced by three workers.
    resend.sent = [];
    for (const id of users) {
      await M.Job.create({ type: "welcome", userId: id, idempotencyKey: `welcome-test:${id}`, expiresAt: new Date(Date.now() + 3_600_000) });
    }
    await Promise.all([outbox.processEmailOutbox({ limit: 10 }), outbox.processEmailOutbox({ limit: 10 }), outbox.processEmailOutbox({ limit: 10 })]);
    expect(resend.sent).toHaveLength(6);
    expect(new Set(resend.sent.map((item) => item.to)).size).toBe(6);
  });

  it("expired jobs are cancelled, not sent late", async () => {
    const user = await M.User.create({ name: "Late", email: `late${++n}@example.com`, role: "student", passwordHash: "x".repeat(20) });
    await outbox.enqueueEmail({ type: "welcome", userId: user._id, idempotencyKey: `late:${user._id}` });
    background.tasks.splice(0);
    await M.Job.updateOne({ idempotencyKey: `late:${user._id}` }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await outbox.processEmailOutbox();
    expect(await M.Job.findOne({ idempotencyKey: `late:${user._id}` }).lean()).toMatchObject({ status: "cancelled", lastErrorCode: "expired" });
  });
});

describe("reviews and certificates", () => {
  it("review emails reflect the persisted decision; certificates notify on issue and revoke", async () => {
    const p = await program("review-notify");
    const { actor, email } = await register(undefined, "Rina <img src=x>");
    const enrolled = await enrollments.createManualEnrollment({ email, programSlug: "review-notify" }, { actorId: admin.id, via: "admin" });
    await flush();
    expect(enrolled.ok).toBe(true);
    expect(await jobsOf(actor!.id, "enrollment_confirmation")).toHaveLength(1);
    const task = (await M.Task.findOne({ programId: p._id }).lean())!;
    const first = await submissions.submitTaskAttempt(actor!, task._id.toString(), { submissionType: "text", textContent: "v1" });
    const firstId = (first as { data: { submissionId: string } }).data.submissionId;
    expect(first).toMatchObject({ ok: true });
    expect(await submissions.reviewSubmission(admin, firstId, { status: "under_review" })).toMatchObject({ ok: true });
    await flush();
    expect(await jobsOf(actor!.id, "submission_reviewed")).toHaveLength(0); // not a final decision
    const reviewed = await submissions.reviewSubmission(admin, firstId, { status: "changes_requested", feedback: "Please add <script>x</script> details." });
    expect(reviewed).toMatchObject({ ok: true });
    await flush();
    const reviewJobs = await jobsOf(actor!.id, "submission_reviewed");
    expect(reviewJobs).toMatchObject([{ status: "sent", data: { status: "changes_requested" } }]);
    const mail = resend.sent.find((item) => item.subject.startsWith("Your submission was reviewed"))!;
    expect(mail.text).toContain("Changes requested");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img src=x>");
    expect(mail.html).not.toContain("<b>review-notify</b>");

    const second = await submissions.submitTaskAttempt(actor!, task._id.toString(), { submissionType: "text", textContent: "v2" });
    const secondId = (second as { data: { submissionId: string } }).data.submissionId;
    await submissions.reviewSubmission(admin, secondId, { status: "accepted", feedback: "Good." });
    await flush();
    expect(await jobsOf(actor!.id, "submission_reviewed")).toHaveLength(2);

    const enrollmentId = (enrolled as { enrollmentId: string }).enrollmentId;
    const issued = await certs.issueCertificate(admin, { enrollmentId, confirm: true });
    expect(issued.ok).toBe(true);
    await flush();
    const certJob = (await jobsOf(actor!.id, "certificate_issued"))[0];
    expect(certJob).toMatchObject({ status: "sent" });
    const certMail = resend.sent.find((item) => item.subject.startsWith("Your certificate is ready"))!;
    expect(certMail.text).toContain("/verify?id=GL-");
    expect(certMail.text).not.toMatch(/\/verify\/[A-Za-z0-9_-]{43}/); // the secret QR token is not emailed
    const certificateId = issued.ok ? issued.data.certificateId : "";
    await certs.revokeCertificate(admin, certificateId, { reason: "Copied project confirmed by review.", confirm: true });
    await flush();
    expect(await jobsOf(actor!.id, "certificate_revoked")).toMatchObject([{ status: "sent" }]);
    expect(await M.Notification.countDocuments({ userId: actor!.id, type: { $in: ["certificate_issued", "certificate_revoked"] } })).toBe(2);
  });
});

describe("send-time checks", () => {
  it("an email whose event no longer holds is cancelled, not sent", async () => {
    const user = await M.User.create({ name: "Check", email: `check${++n}@example.com`, role: "student", passwordHash: "x".repeat(20) });
    const payment = await M.Payment.create({
      studentId: user._id,
      programId: new Types.ObjectId(),
      provider: "razorpay",
      mode: "test",
      amount: 100,
      currency: "INR",
      status: "pending",
      idempotencyKey: randomUUID(),
    });
    // A payment-confirmation job for a payment that is not (or no longer) paid.
    await M.Job.create({
      type: "payment_confirmation",
      userId: user._id,
      relatedEntityType: "payment",
      relatedEntityId: payment._id,
      idempotencyKey: `check:${payment._id}`,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    resend.sent = [];
    await outbox.processEmailOutbox();
    expect(await M.Job.findOne({ idempotencyKey: `check:${payment._id}` }).lean()).toMatchObject({ status: "cancelled", lastErrorCode: "not_applicable" });
    expect(resend.sent).toHaveLength(0);
  });
});

describe("in-app notifications", () => {
  it("students only see and mark their own notifications", async () => {
    const a = (await register()).actor!;
    const b = (await register()).actor!;
    await flush();
    const own = await notifications.listOwnNotifications(a);
    expect(own.total).toBe(1);
    expect(own.unread).toBe(1);
    const id = own.items[0].id;
    expect(await notifications.markNotificationRead(b, id)).toMatchObject({ ok: false, error: "not_found" });
    expect((await notifications.listOwnNotifications(a)).unread).toBe(1);
    expect(await notifications.markNotificationRead(a, id)).toEqual({ ok: true, data: null });
    expect(await notifications.countUnreadNotifications(a)).toBe(0);
    expect((await notifications.listOwnNotifications(b)).items.every((item) => item.id !== id)).toBe(true);
    await expect(notifications.listOwnNotifications(admin)).rejects.toMatchObject({ code: "not_authorized" });
  });

  it("unsafe links are dropped when stored", async () => {
    const a = (await register()).actor!;
    await notifications.createNotification({ userId: a.id, type: "welcome", title: "x", message: "y", link: "//evil.example", idempotencyKey: "evil" });
    expect((await M.Notification.findOne({ userId: a.id, idempotencyKey: "evil" }).lean())?.link).toBeNull();
  });
});

describe("admin monitoring", () => {
  it("is admin-only and retry is limited to failed jobs", async () => {
    const a = (await register()).actor!;
    await flush();
    await expect(adminEmails.listEmailJobs(a)).rejects.toMatchObject({ code: "not_authorized" });
    await expect(adminEmails.retryEmailJob(a, new Types.ObjectId().toString())).rejects.toMatchObject({ code: "not_authorized" });
    const sentJob = (await jobsOf(a.id, "welcome"))[0];
    expect(await adminEmails.retryEmailJob(admin, sentJob._id.toString())).toMatchObject({ ok: false, error: "conflict" });
    const list = await adminEmails.listEmailJobs(admin, { status: "sent" });
    expect(list.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toMatch(/re_test_fake_key|token=/);
  });
});

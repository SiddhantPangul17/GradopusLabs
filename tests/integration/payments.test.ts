import { createHmac } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { freshModules, programInput } from "../helpers";

/*
 * Payment workflow against a real (throwaway) MongoDB and the REAL Razorpay
 * provider code (signatures, parsing, HTTP handling). Only the network is
 * replaced: `fetch` is stubbed with a fake Razorpay API, so no real gateway
 * (sandbox or live) is contacted and no money moves.
 */

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), refresh: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const KEY_ID = "rzp_test_INTEGRATION";
const KEY_SECRET = "integration_key_secret_value";
const WEBHOOK_SECRET = "integration_webhook_secret_value";
const hmac = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex");

// ---------- Fake Razorpay API ----------

type FakePayment = { id: string; order_id: string; amount: number; currency: string; status: string; error_code: string | null };
const fake = {
  outage: false,
  orders: new Map<string, { amount: number; currency: string; receipt: string }>(),
  payments: new Map<string, FakePayment>(),
  seq: 0,
  reset() {
    this.outage = false;
    this.orders.clear();
    this.payments.clear();
  },
};

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (fake.outage) throw new TypeError("fetch failed");
  const url = new URL(String(input));
  const auth = new Headers(init?.headers).get("authorization");
  if (auth !== `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`) {
    return Response.json({ error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } }, { status: 401 });
  }
  const path = url.pathname.replace(/^\/v1/, "");
  if (init?.method === "POST" && path === "/orders") {
    const body = JSON.parse(String(init.body));
    const id = `order_${++fake.seq}`;
    fake.orders.set(id, { amount: body.amount, currency: body.currency, receipt: body.receipt });
    return Response.json({ id, entity: "order", amount: body.amount, currency: body.currency, receipt: body.receipt, status: "created" });
  }
  const payment = path.match(/^\/payments\/([\w]+)$/);
  if (payment) {
    const found = fake.payments.get(payment[1]);
    return found ? Response.json(found) : Response.json({ error: { code: "BAD_REQUEST_ERROR" } }, { status: 400 });
  }
  const orderPayments = path.match(/^\/orders\/([\w]+)\/payments$/);
  if (orderPayments) {
    return Response.json({ entity: "collection", items: [...fake.payments.values()].filter((item) => item.order_id === orderPayments[1]) });
  }
  return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
}

/** The provider records a payment attempt on an order (as if the student paid in Checkout). */
function providerPays(orderId: string, status = "captured", overrides: Partial<FakePayment> = {}) {
  const order = fake.orders.get(orderId)!;
  const id = `pay_${++fake.seq}`;
  const entity: FakePayment = { id, order_id: orderId, amount: order.amount, currency: order.currency, status, error_code: status === "failed" ? "BAD_REQUEST_ERROR" : null, ...overrides };
  fake.payments.set(id, entity);
  return { id, entity, signature: hmac(KEY_SECRET, `${orderId}|${id}`) };
}

function webhook(event: string, entity: FakePayment, eventId = `evt_${++fake.seq}`, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify({ entity: "event", event, contains: ["payment"], payload: { payment: { entity: { ...entity, card: { last4: "1111" }, email: "x@example.com" } } } });
  return payments.processPaymentWebhook(raw, new Headers({ "x-razorpay-signature": hmac(secret, raw), "x-razorpay-event-id": eventId }));
}

// ---------- Setup ----------

let server: MongoMemoryServer;
let payments: typeof import("@/lib/services/payment-service");
let enrollments: typeof import("@/lib/services/enrollment-service");
let M: {
  User: typeof import("@/models/user").UserModel;
  Program: typeof import("@/models/program").ProgramModel;
  Enrollment: typeof import("@/models/enrollment").EnrollmentModel;
  Payment: typeof import("@/models/payment").PaymentModel;
  AuditLog: typeof import("@/models/audit-log").AuditLogModel;
  WebhookEvent: typeof import("@/models/webhook-event").WebhookEventModel;
  RateLimit: typeof import("@/models/rate-limit").RateLimitModel;
};

type Student = { id: string; role: "student"; name: string; email: string };
let alice: Student;
let bob: Student;
let admin: { id: string; role: "admin" };
const PRICE = 14900;

async function makeStudent(name: string, email: string): Promise<Student> {
  const doc = await M.User.create({ name, email, role: "student", passwordHash: "x".repeat(20) });
  return { id: doc._id.toString(), role: "student", name, email };
}

let slugCounter = 0;
async function makeProgram(overrides: Record<string, unknown> = {}) {
  const slug = `pay-program-${++slugCounter}`;
  await M.Program.create(programInput({ slug, title: `Paid program ${slugCounter}`, price: PRICE, status: "published", availability: "open", ...overrides }));
  return slug;
}

async function startCheckout(student: Student, slug: string) {
  const result = await payments.createCheckoutOrder(student, { programSlug: slug });
  if (!result.ok) throw new Error(`checkout failed: ${result.message}`);
  return result.data;
}

const enrollmentsFor = (student: Student) => M.Enrollment.find({ studentId: student.id }).lean();

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await freshModules({
    MONGODB_URI: server.getUri(),
    MONGODB_DB_NAME: "krushitech_payments_test",
    NODE_ENV: "test",
    PAYMENT_PROVIDER: "razorpay",
    PAYMENT_MODE: "test",
    PAYMENT_KEY_ID: KEY_ID,
    PAYMENT_KEY_SECRET: KEY_SECRET,
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
  });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  payments = await import("@/lib/services/payment-service");
  enrollments = await import("@/lib/services/enrollment-service");
  M = {
    User: (await import("@/models/user")).UserModel,
    Program: (await import("@/models/program")).ProgramModel,
    Enrollment: (await import("@/models/enrollment")).EnrollmentModel,
    Payment: (await import("@/models/payment")).PaymentModel,
    AuditLog: (await import("@/models/audit-log")).AuditLogModel,
    WebhookEvent: (await import("@/models/webhook-event")).WebhookEventModel,
    RateLimit: (await import("@/models/rate-limit")).RateLimitModel,
  };
  await (await import("@/lib/db/mongodb")).connectToDatabase();
  await Promise.all(Object.values(M).map((model) => model.init()));
  const adminDoc = await M.User.create({ name: "Ada Admin", email: "ada@example.com", role: "admin", passwordHash: "x".repeat(20) });
  admin = { id: adminDoc._id.toString(), role: "admin" };
});

beforeEach(async () => {
  fake.reset();
  await M.RateLimit.deleteMany({});
  alice = await makeStudent("Alice", `alice${++slugCounter}@example.com`);
  bob = await makeStudent("Bob", `bob${++slugCounter}@example.com`);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const db = await import("@/lib/db/mongodb");
  await (await db.connectToDatabase()).disconnect();
  await server?.stop();
});

// ---------- Tests ----------

describe("starting checkout", () => {
  it("only students can start checkout", async () => {
    const slug = await makeProgram();
    await expect(payments.createCheckoutOrder({ ...admin, name: "A", email: "a@x.io" } as never, { programSlug: slug })).rejects.toMatchObject({
      code: "not_authorized",
    });
  });

  it("refuses draft, archived and not-open programs, and suspended students", async () => {
    for (const overrides of [{ status: "draft" }, { status: "archived" }]) {
      const slug = await makeProgram(overrides);
      expect(await payments.createCheckoutOrder(alice, { programSlug: slug })).toMatchObject({ ok: false, error: "not_found" });
    }
    const closed = await makeProgram({ availability: "coming-soon" });
    expect(await payments.createCheckoutOrder(alice, { programSlug: closed })).toMatchObject({ ok: false, error: "conflict" });
    const open = await makeProgram();
    await M.User.updateOne({ _id: alice.id }, { accountStatus: "suspended" });
    expect(await payments.createCheckoutOrder(alice, { programSlug: open })).toMatchObject({ ok: false, error: "forbidden" });
    expect(fake.orders.size).toBe(0);
  });

  it("uses the database price; browser-supplied price, currency or discount are rejected", async () => {
    const slug = await makeProgram();
    for (const tampered of [{ amount: 100 }, { price: 100 }, { currency: "USD" }, { discount: PRICE }, { studentId: bob.id }]) {
      expect(await payments.createCheckoutOrder(alice, { programSlug: slug, ...tampered })).toMatchObject({ ok: false, error: "invalid" });
    }
    const session = await startCheckout(alice, slug);
    expect(session.checkout.amount).toBe(PRICE);
    expect(session.checkout.currency).toBe("INR");
    const order = fake.orders.get(session.checkout.orderId)!;
    expect(order.amount).toBe(PRICE);
    const record = await M.Payment.findById(session.payment.id).lean();
    expect(record).toMatchObject({ amount: PRICE, currency: "INR", status: "created", mode: "test", studentId: new Types.ObjectId(alice.id) });
    // The provider receipt is our random idempotency key, never a student detail.
    expect(order.receipt).toBe(record!.idempotencyKey);
  });

  it("returns the same open order on refresh or double click (no second order)", async () => {
    const slug = await makeProgram();
    const [first, second] = await Promise.all([
      payments.createCheckoutOrder(alice, { programSlug: slug }),
      payments.createCheckoutOrder(alice, { programSlug: slug }),
    ]);
    // One request creates the order; a concurrent one is told to retry, and a later one resumes it.
    const succeeded = [first, second].filter((result) => result.ok);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    const again = await startCheckout(alice, slug);
    const again2 = await startCheckout(alice, slug);
    expect(again2.checkout.orderId).toBe(again.checkout.orderId);
    expect(fake.orders.size).toBe(1);
    expect(await M.Payment.countDocuments({ studentId: alice.id })).toBe(1);
    // Reading the checkout page never creates orders.
    await payments.getCheckoutState(alice, slug);
    expect(fake.orders.size).toBe(1);
  });

  it("gateway outage while creating the order: nothing to pay, record marked failed, no access", async () => {
    const slug = await makeProgram();
    fake.outage = true;
    expect(await payments.createCheckoutOrder(alice, { programSlug: slug })).toMatchObject({ ok: false, error: "unavailable" });
    const record = await M.Payment.findOne({ studentId: alice.id }).lean();
    expect(record).toMatchObject({ status: "failed", failureCode: "order_not_created", providerOrderId: null });
    fake.outage = false;
    // A new attempt works afterwards.
    await startCheckout(alice, slug);
    expect(await enrollmentsFor(alice)).toHaveLength(0);
  });
});

describe("checkout verification", () => {
  it("activates the enrolment only after signature + provider confirmation", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    const paid = providerPays(session.checkout.orderId);
    const result = await payments.verifyCheckoutPayment(alice, {
      paymentId: session.payment.id,
      providerOrderId: session.checkout.orderId,
      providerPaymentId: paid.id,
      signature: paid.signature,
    });
    expect(result).toMatchObject({ ok: true, data: { status: "paid" } });
    const [enrollment] = await enrollmentsFor(alice);
    expect(enrollment).toMatchObject({ status: "active", source: "payment", amountPaid: PRICE, currency: "INR" });
    const record = await M.Payment.findById(session.payment.id).lean();
    expect(record).toMatchObject({ status: "paid", providerPaymentId: paid.id, verifiedVia: "checkout", enrollmentId: enrollment._id });
    expect(record!.paidAt).toBeInstanceOf(Date);
    const actions = (await M.AuditLog.find({ entityId: { $in: [record!._id, enrollment._id] } }).lean()).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["payment.order_created", "payment.paid", "enrollment.created"]));
    // Verifying again (page refresh, double submit) changes nothing.
    await payments.verifyCheckoutPayment(alice, {
      paymentId: session.payment.id,
      providerOrderId: session.checkout.orderId,
      providerPaymentId: paid.id,
      signature: paid.signature,
    });
    expect(await enrollmentsFor(alice)).toHaveLength(1);
    expect(await M.AuditLog.countDocuments({ action: "payment.paid", entityId: record!._id })).toBe(1);
    // Afterwards checkout shows "already enrolled" and refuses a new order.
    expect((await payments.getCheckoutState(alice, slug)).kind).toBe("already_enrolled");
    expect(await payments.createCheckoutOrder(alice, { programSlug: slug })).toMatchObject({ ok: false, error: "conflict" });
  });

  it("rejects forged signatures and does not change the payment", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    const paid = providerPays(session.checkout.orderId);
    for (const signature of [hmac("guessed-secret", `${session.checkout.orderId}|${paid.id}`), hmac(KEY_SECRET, `order_other|${paid.id}`), "0".repeat(64)]) {
      const result = await payments.verifyCheckoutPayment(alice, {
        paymentId: session.payment.id,
        providerOrderId: session.checkout.orderId,
        providerPaymentId: paid.id,
        signature,
      });
      expect(result).toMatchObject({ ok: false, error: "invalid" });
    }
    expect(await M.Payment.findById(session.payment.id).lean()).toMatchObject({ status: "created", providerPaymentId: null });
    expect(await enrollmentsFor(alice)).toHaveLength(0);
    expect(await M.AuditLog.countDocuments({ action: "payment.verification_failed" })).toBeGreaterThanOrEqual(3);
  });

  it("a valid payment for a DIFFERENT order cannot be replayed onto this one", async () => {
    const cheap = await makeProgram({ price: 100 });
    const expensive = await makeProgram();
    const cheapSession = await startCheckout(alice, cheap);
    const cheapPaid = providerPays(cheapSession.checkout.orderId);
    const expensiveSession = await startCheckout(alice, expensive);
    const result = await payments.verifyCheckoutPayment(alice, {
      paymentId: expensiveSession.payment.id,
      providerOrderId: cheapSession.checkout.orderId,
      providerPaymentId: cheapPaid.id,
      signature: cheapPaid.signature,
    });
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    expect(await M.Payment.findById(expensiveSession.payment.id).lean()).toMatchObject({ status: "created" });
  });

  it("a student cannot verify, view or reconcile another student's payment", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    const paid = providerPays(session.checkout.orderId);
    expect(
      await payments.verifyCheckoutPayment(bob, {
        paymentId: session.payment.id,
        providerOrderId: session.checkout.orderId,
        providerPaymentId: paid.id,
        signature: paid.signature,
      }),
    ).toMatchObject({ ok: false, error: "not_found" });
    expect(await payments.getPaymentForViewer(bob, session.payment.id)).toBeNull();
    expect(await payments.reconcilePayment(bob, session.payment.id)).toMatchObject({ ok: false, error: "not_found" });
    expect((await payments.listOwnPayments(bob)).total).toBe(0);
    expect(await enrollmentsFor(bob)).toHaveLength(0);
    expect(await payments.getPaymentForViewer(alice, session.payment.id)).not.toBeNull();
    expect(await payments.getPaymentForViewer(admin, session.payment.id)).not.toBeNull();
  });

  it("provider outage during verification leaves the payment pending (no access) until a webhook confirms it", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    const paid = providerPays(session.checkout.orderId);
    fake.outage = true;
    const result = await payments.verifyCheckoutPayment(alice, {
      paymentId: session.payment.id,
      providerOrderId: session.checkout.orderId,
      providerPaymentId: paid.id,
      signature: paid.signature,
    });
    expect(result).toMatchObject({ ok: true, data: { status: "pending" } });
    expect(await enrollments.hasCurrentEnrollment(alice.id, (await M.Program.findOne({ slug }))!._id.toString())).toBe(false);
    expect(await payments.reconcilePayment(alice, session.payment.id)).toMatchObject({ ok: false, error: "unavailable" });
    // A pending payment blocks starting a second payment on top of it.
    expect(await payments.createCheckoutOrder(alice, { programSlug: slug })).toMatchObject({ ok: false, error: "conflict" });
    fake.outage = false;
    expect((await webhook("payment.captured", paid.entity)).status).toBe(200);
    expect(await M.Payment.findById(session.payment.id).lean()).toMatchObject({ status: "paid", verifiedVia: "webhook" });
    expect(await enrollmentsFor(alice)).toHaveLength(1);
  });

  it("an authorized-but-not-captured payment grants no access", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    const paid = providerPays(session.checkout.orderId, "authorized");
    const result = await payments.verifyCheckoutPayment(alice, {
      paymentId: session.payment.id,
      providerOrderId: session.checkout.orderId,
      providerPaymentId: paid.id,
      signature: paid.signature,
    });
    expect(result).toMatchObject({ ok: true, data: { status: "authorized" } });
    expect(await enrollmentsFor(alice)).toHaveLength(0);
  });
});

describe("webhooks", () => {
  it("rejects invalid signatures before touching the database", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    const paid = providerPays(session.checkout.orderId);
    expect((await webhook("payment.captured", paid.entity, "evt_forged", "wrong-secret")).status).toBe(400);
    expect(await M.WebhookEvent.countDocuments({ eventId: "evt_forged" })).toBe(0);
    expect(await M.Payment.findById(session.payment.id).lean()).toMatchObject({ status: "created" });
  });

  it("processes duplicate deliveries once", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    const paid = providerPays(session.checkout.orderId);
    const first = await webhook("payment.captured", paid.entity, "evt_dup");
    const second = await webhook("payment.captured", paid.entity, "evt_dup");
    const parallel = await Promise.all([webhook("order.paid", paid.entity, "evt_par"), webhook("order.paid", paid.entity, "evt_par")]);
    expect(first.status).toBe(200);
    expect(second).toMatchObject({ status: 200, body: { duplicate: true } });
    expect(parallel.every((result) => [200, 409].includes(result.status))).toBe(true);
    expect(await enrollmentsFor(alice)).toHaveLength(1);
    expect(await M.AuditLog.countDocuments({ action: "payment.paid", entityId: new Types.ObjectId(session.payment.id) })).toBe(1);
    expect(await M.WebhookEvent.findOne({ eventId: "evt_dup" }).lean()).toMatchObject({ status: "processed", outcome: "paid" });
  });

  it("does not activate on a wrong amount, currency or unknown order", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    const wrongAmount = providerPays(session.checkout.orderId, "captured", { amount: 100 });
    expect((await webhook("payment.captured", wrongAmount.entity)).status).toBe(200);
    const wrongCurrency = providerPays(session.checkout.orderId, "captured", { currency: "USD" });
    expect((await webhook("payment.captured", wrongCurrency.entity)).status).toBe(200);
    const record = await M.Payment.findById(session.payment.id).lean();
    expect(record).toMatchObject({ status: "created", attentionReason: "verification_mismatch" });
    expect(await enrollmentsFor(alice)).toHaveLength(0);
    // Events for orders we do not know are acknowledged and ignored.
    const unknown = await webhook("payment.captured", { ...wrongAmount.entity, order_id: "order_unknown" }, "evt_unknown");
    expect(unknown.status).toBe(200);
    expect(await M.WebhookEvent.findOne({ eventId: "evt_unknown" }).lean()).toMatchObject({ status: "ignored", outcome: "unknown_order" });
  });

  it("a late failure never reverses a verified payment; a capture after a failure still activates", async () => {
    const slugA = await makeProgram();
    const a = await startCheckout(alice, slugA);
    const paid = providerPays(a.checkout.orderId);
    await webhook("payment.captured", paid.entity);
    await webhook("payment.failed", { ...paid.entity, status: "failed", error_code: "BAD_REQUEST_ERROR" });
    await webhook("payment.authorized", { ...paid.entity, status: "authorized" });
    expect(await M.Payment.findById(a.payment.id).lean()).toMatchObject({ status: "paid" });
    expect(await enrollmentsFor(alice)).toHaveLength(1);

    const slugB = await makeProgram();
    const b = await startCheckout(bob, slugB);
    const failed = providerPays(b.checkout.orderId, "failed");
    await webhook("payment.failed", failed.entity);
    expect(await M.Payment.findById(b.payment.id).lean()).toMatchObject({ status: "failed", failureCode: "BAD_REQUEST_ERROR" });
    expect(await enrollmentsFor(bob)).toHaveLength(0);
    const retried = providerPays(b.checkout.orderId);
    await webhook("payment.captured", retried.entity);
    expect(await M.Payment.findById(b.payment.id).lean()).toMatchObject({ status: "paid", providerPaymentId: retried.id });
    expect(await enrollmentsFor(bob)).toHaveLength(1);
  });

  it("checkout verification and webhook racing still create one enrolment", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    const paid = providerPays(session.checkout.orderId);
    await Promise.all([
      payments.verifyCheckoutPayment(alice, {
        paymentId: session.payment.id,
        providerOrderId: session.checkout.orderId,
        providerPaymentId: paid.id,
        signature: paid.signature,
      }),
      webhook("payment.captured", paid.entity),
      webhook("order.paid", paid.entity),
    ]);
    expect(await enrollmentsFor(alice)).toHaveLength(1);
    expect(await M.Payment.findById(session.payment.id).lean()).toMatchObject({ status: "paid" });
  });
});

describe("activation policy and recovery", () => {
  it("a program archived while payment was pending: payment kept as paid, no access, flagged", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    await M.Program.updateOne({ slug }, { status: "archived" });
    const paid = providerPays(session.checkout.orderId);
    await webhook("payment.captured", paid.entity);
    expect(await M.Payment.findById(session.payment.id).lean()).toMatchObject({
      status: "paid",
      enrollmentId: null,
      attentionReason: "program_unavailable",
    });
    expect(await enrollmentsFor(alice)).toHaveLength(0);
    expect(await M.AuditLog.countDocuments({ action: "payment.needs_attention", entityId: new Types.ObjectId(session.payment.id) })).toBe(1);
    expect((await payments.listPaymentsForAdmin(admin, { status: "attention" })).items.map((item) => item.id)).toContain(session.payment.id);
  });

  it("paying while already enrolled is flagged as a possible duplicate, not a second enrolment", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    await enrollments.createManualEnrollment({ email: alice.email, programSlug: slug }, { actorId: admin.id, via: "admin" });
    const paid = providerPays(session.checkout.orderId);
    await webhook("payment.captured", paid.entity);
    expect(await M.Payment.findById(session.payment.id).lean()).toMatchObject({ status: "paid", attentionReason: "already_enrolled" });
    expect(await enrollmentsFor(alice)).toHaveLength(1);
  });

  it("completes an interrupted activation (paid but no enrolment yet) on the next check", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    const paid = providerPays(session.checkout.orderId);
    // Simulate a crash right after the payment was marked paid.
    await M.Payment.updateOne({ _id: session.payment.id }, { status: "paid", providerPaymentId: paid.id, paidAt: new Date() });
    expect(await enrollmentsFor(alice)).toHaveLength(0);
    expect(await payments.reconcilePayment(admin, session.payment.id)).toMatchObject({ ok: true });
    expect(await enrollmentsFor(alice)).toHaveLength(1);
    expect(await M.AuditLog.countDocuments({ action: "payment.reconciled", actorId: new Types.ObjectId(admin.id) })).toBeGreaterThanOrEqual(1);
  });

  it("reconciliation applies the provider's real state only", async () => {
    const slug = await makeProgram();
    const session = await startCheckout(alice, slug);
    // No attempt at the provider yet: nothing changes.
    expect(await payments.reconcilePayment(alice, session.payment.id)).toMatchObject({ ok: true, data: { status: "created" } });
    providerPays(session.checkout.orderId);
    expect(await payments.reconcilePayment(alice, session.payment.id)).toMatchObject({ ok: true, data: { status: "paid" } });
    expect(await enrollmentsFor(alice)).toHaveLength(1);
  });

  it("payment history comes from payment records, never from enrolments", async () => {
    const slug = await makeProgram();
    await enrollments.createManualEnrollment({ email: alice.email, programSlug: slug }, { actorId: admin.id, via: "admin" });
    expect((await payments.listOwnPayments(alice)).total).toBe(0);
    await expect(payments.listPaymentsForAdmin(alice)).rejects.toMatchObject({ code: "not_authorized" });
  });
});

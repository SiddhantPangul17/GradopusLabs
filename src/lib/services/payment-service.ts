import "server-only";
import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { brand } from "@/config/brand";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import {
  CURRENT_ENROLLMENT_STATUSES,
  MIN_ONLINE_PAYMENT_PAISE,
  ONLINE_PAYMENT_CURRENCIES,
  OPEN_PAYMENT_STATUSES,
  type PaymentAttentionReason,
  type PaymentMode,
  type PaymentStatus,
} from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { isDuplicateKeyError } from "@/lib/errors";
import { getPaymentAvailability, type PaymentAvailability } from "@/lib/payments/config";
import { getPaymentProvider } from "@/lib/payments/provider";
import { canTransition, matchesExpected, statusesAllowing, statusForProviderState } from "@/lib/payments/state";
import {
  PaymentProviderRejectedError,
  PaymentProviderUnavailableError,
  type CheckoutOptions,
  type PaymentProvider,
  type ProviderPayment,
} from "@/lib/payments/types";
import { notifyEnrollmentActivated, notifyPaymentConfirmed } from "@/lib/notifications/events";
import { recordAuditEvent } from "@/lib/services/audit-log";
import { assertAdmin, assertStudent, type Actor } from "@/lib/services/authorization";
import { fail, type ServiceResult } from "@/lib/services/result";
import { isValidObjectIdString } from "@/lib/validation/common";
import { createOrderSchema, verifyCheckoutSchema } from "@/lib/validation/payment";
import { EnrollmentModel } from "@/models/enrollment";
import { PaymentModel, type PaymentRecord } from "@/models/payment";
import { ProgramModel } from "@/models/program";
import { UserModel } from "@/models/user";
import { WebhookEventModel } from "@/models/webhook-event";

/*
 * Online payments and paid enrollment activation.
 *
 * Trust rules (see docs/payments.md):
 * - The amount and currency always come from the program in the database.
 * - A payment becomes "paid" only from provider data that has been
 *   authenticated (signed webhook, or a valid checkout signature followed by
 *   an API fetch) AND matches the local order id, amount and currency.
 *   Browser redirects, success URLs, submitted payment ids or statuses never
 *   mark anything paid.
 * - If the provider cannot be reached or the result is unclear, the payment
 *   stays pending and is reconciled later (webhook retries, "check again").
 * - Activation is idempotent without transactions: compare-and-set status
 *   updates, a unique index on enrollment.paymentId, the one-current-enrollment
 *   index, and a recovery step that completes a half-finished activation
 *   whenever the payment is seen again.
 */

type Id = Types.ObjectId;
type PaymentDoc = PaymentRecord & { _id: Id };

/** Orders the student can resume are reused for this long, then replaced. */
const OPEN_ORDER_REUSE_MS = 24 * 60 * 60 * 1000;
/** A record still waiting for its provider order is "being set up" for this long. */
const ORDER_SETUP_GRACE_MS = 60 * 1000;
export const STUDENT_PAYMENTS_PAGE_SIZE = 10;
export const ADMIN_PAYMENTS_PAGE_SIZE = 25;

let indexesReady: Promise<unknown> | null = null;

/** Unique indexes are part of the safety model, so make sure they exist before writing. */
async function ready(): Promise<void> {
  await connectToDatabase();
  indexesReady ??= Promise.all([PaymentModel.init(), EnrollmentModel.init(), WebhookEventModel.init()]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  await indexesReady;
}

// ---------- Views ----------

export type PaymentView = {
  id: string;
  program: { id: string; title: string; slug: string };
  amount: number;
  currency: string;
  status: PaymentStatus;
  mode: PaymentMode;
  provider: string;
  providerOrderId: string | null;
  failureCode: string | null;
  attentionReason: PaymentAttentionReason | null;
  enrollmentId: string | null;
  createdAt: string;
  paidAt: string | null;
};

async function toViews(docs: PaymentDoc[]): Promise<PaymentView[]> {
  const programs = await ProgramModel.find({ _id: { $in: docs.map((doc) => doc.programId) } })
    .select("title slug")
    .lean();
  const programBy = new Map(programs.map((program) => [program._id.toString(), program]));
  return docs.map((doc) => {
    const program = programBy.get(doc.programId.toString());
    return {
      id: doc._id.toString(),
      program: { id: doc.programId.toString(), title: program?.title ?? "Unknown program", slug: program?.slug ?? "" },
      amount: doc.amount,
      currency: doc.currency,
      status: doc.status,
      mode: doc.mode,
      provider: doc.provider,
      providerOrderId: doc.providerOrderId,
      failureCode: doc.failureCode,
      attentionReason: doc.attentionReason ?? null,
      enrollmentId: doc.enrollmentId?.toString() ?? null,
      createdAt: doc.createdAt.toISOString(),
      paidAt: doc.paidAt?.toISOString() ?? null,
    };
  });
}

async function toView(doc: PaymentDoc): Promise<PaymentView> {
  return (await toViews([doc]))[0];
}

async function reload(id: Id): Promise<PaymentDoc> {
  const doc = await PaymentModel.findById(id).lean<PaymentDoc>();
  if (!doc) throw new Error("Payment disappeared");
  return doc;
}

function logProviderProblem(operation: string, error: unknown): void {
  // Error class and short code only: never request bodies, credentials or provider descriptions.
  if (error instanceof PaymentProviderRejectedError) console.error(`[payments] ${operation} rejected by provider (${error.code})`);
  else if (error instanceof PaymentProviderUnavailableError) console.error(`[payments] ${operation}: provider unavailable`);
  else console.error(`[payments] ${operation} failed unexpectedly`);
}

// ---------- Checkout page ----------

export type CheckoutState =
  | { kind: "not_found" }
  | { kind: "already_enrolled"; programTitle: string; enrollmentId: string }
  | {
      kind: "ready";
      program: { title: string; slug: string; amount: number; currency: string; availability: string; purchasable: boolean };
      payments: PaymentAvailability;
      /** A verified payment for this program that has not produced access (needs an administrator). */
      unresolvedPaidPayment: PaymentView | null;
      openPayment: PaymentView | null;
    };

/** Everything the checkout page shows, from the database only. Read-only: never creates orders. */
export async function getCheckoutState(actor: Actor, programSlug: string): Promise<CheckoutState> {
  assertStudent(actor);
  await connectToDatabase();
  const program = await ProgramModel.findOne({ slug: programSlug, status: "published" })
    .select("title slug price currency availability")
    .lean();
  if (!program) return { kind: "not_found" };

  const enrollment = await EnrollmentModel.findOne({
    studentId: actor.id,
    programId: program._id,
    status: { $in: [...CURRENT_ENROLLMENT_STATUSES] },
  })
    .select("_id")
    .lean();
  if (enrollment) return { kind: "already_enrolled", programTitle: program.title, enrollmentId: enrollment._id.toString() };

  const [open, unresolved] = await Promise.all([
    PaymentModel.findOne({ studentId: actor.id, programId: program._id, status: { $in: [...OPEN_PAYMENT_STATUSES] } })
      .sort({ createdAt: -1 })
      .lean<PaymentDoc>(),
    PaymentModel.findOne({ studentId: actor.id, programId: program._id, status: "paid", enrollmentId: null })
      .sort({ createdAt: -1 })
      .lean<PaymentDoc>(),
  ]);

  return {
    kind: "ready",
    program: {
      title: program.title,
      slug: program.slug,
      amount: program.price,
      currency: program.currency,
      availability: program.availability,
      purchasable: isPurchasable(program),
    },
    payments: getPaymentAvailability(),
    unresolvedPaidPayment: unresolved ? await toView(unresolved) : null,
    openPayment: open ? await toView(open) : null,
  };
}

function isPurchasable(program: { availability: string; price: number; currency: string }): boolean {
  return (
    program.availability === "open" &&
    program.price >= MIN_ONLINE_PAYMENT_PAISE &&
    (ONLINE_PAYMENT_CURRENCIES as readonly string[]).includes(program.currency)
  );
}

// ---------- Create order ----------

export type CheckoutSession = {
  payment: PaymentView;
  checkout: CheckoutOptions & { name: string; description: string; prefill: { name: string; email: string } };
};

/**
 * Creates (or resumes) the provider order for a program. The browser only
 * names the program; everything else comes from the database and session.
 * Calling it again while an order is open returns the same order, so
 * refreshing or double-clicking never creates a second one.
 */
export async function createCheckoutOrder(
  actor: Actor & { name: string; email: string },
  input: unknown,
): Promise<ServiceResult<CheckoutSession>> {
  assertStudent(actor);
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Choose a program to pay for.");

  const provider = getPaymentProvider();
  if (!provider) return fail("unavailable", "Online payments are not available at the moment. No payment has been taken.");

  await ready();
  const limit = await consumeRateLimit(RATE_LIMITS.checkoutPerAccount, actor.id);
  if (!limit.allowed) return fail("rate_limited", "Too many payment attempts. Please wait a few minutes and try again.");

  const student = await UserModel.exists({ _id: actor.id, role: "student", accountStatus: "active" });
  if (!student) return fail("forbidden", "Your account cannot make payments.");

  const program = await ProgramModel.findOne({ slug: parsed.data.programSlug, status: "published" })
    .select("title slug price currency availability")
    .lean();
  if (!program) return fail("not_found", "This program is not available.");
  if (!isPurchasable(program)) return fail("conflict", "Enrollment for this program is not open for online payment.");

  const enrolled = await EnrollmentModel.exists({
    studentId: actor.id,
    programId: program._id,
    status: { $in: [...CURRENT_ENROLLMENT_STATUSES] },
  });
  if (enrolled) return fail("conflict", "You are already enrolled in this program.");

  const studentId = new Types.ObjectId(actor.id);
  const session = (payment: PaymentDoc, view: PaymentView): CheckoutSession => ({
    payment: view,
    checkout: {
      ...provider.checkoutOptions({ id: payment.providerOrderId as string, amount: payment.amount, currency: payment.currency }),
      name: brand.name,
      description: program.title,
      prefill: { name: actor.name, email: actor.email },
    },
  });

  // Resume an open order if it still matches the current price.
  const open = await PaymentModel.findOne({
    studentId,
    programId: program._id,
    mode: provider.mode,
    status: { $in: [...OPEN_PAYMENT_STATUSES] },
  }).lean<PaymentDoc>();
  if (open) {
    const age = Date.now() - open.createdAt.getTime();
    if (open.status !== "created") {
      // The checkout already returned a payment for this order: never start another one on top.
      return fail("conflict", "Your previous payment for this program is still being confirmed. Please check its status before paying again.");
    }
    if (!open.providerOrderId) {
      if (age < ORDER_SETUP_GRACE_MS) return fail("conflict", "Your payment is being set up. Please try again in a moment.");
    } else if (
      open.provider === provider.name &&
      open.amount === program.price &&
      open.currency === program.currency &&
      age < OPEN_ORDER_REUSE_MS
    ) {
      return { ok: true, data: session(open, await toView(open)) };
    }
    // Stale or outdated price: retire it. A late capture on it is still honoured (cancelled → paid is allowed).
    const retired = await PaymentModel.updateOne(
      { _id: open._id, status: "created" },
      { $set: { status: "cancelled", failureCode: "superseded" } },
    );
    if (retired.modifiedCount === 1) {
      await recordAuditEvent({
        actorId: actor.id,
        action: "payment.cancelled",
        entityType: "payment",
        entityId: open._id,
        metadata: { reason: "superseded" },
      });
    }
  }

  let created: PaymentDoc;
  try {
    created = (
      await PaymentModel.create({
        studentId,
        programId: program._id,
        provider: provider.name,
        mode: provider.mode,
        amount: program.price,
        currency: program.currency,
        status: "created",
        idempotencyKey: randomUUID(),
      })
    ).toObject() as PaymentDoc;
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail("conflict", "Your payment is being set up. Please try again in a moment.");
    throw error;
  }

  let order;
  try {
    order = await provider.createOrder({
      amount: created.amount,
      currency: created.currency,
      receipt: created.idempotencyKey,
      notes: { payment_ref: created._id.toString(), program: program.slug },
    });
  } catch (error) {
    logProviderProblem("create order", error);
    await PaymentModel.updateOne(
      { _id: created._id, status: "created" },
      { $set: { status: "failed", failureCode: "order_not_created" } },
    );
    if (!(error instanceof PaymentProviderUnavailableError) && !(error instanceof PaymentProviderRejectedError)) throw error;
    return fail("unavailable", "We could not start the payment. No money has been taken. Please try again in a few minutes.");
  }

  if (order.amount !== created.amount || order.currency !== created.currency) {
    console.error("[payments] provider order does not match the requested amount or currency");
    await PaymentModel.updateOne(
      { _id: created._id, status: "created" },
      { $set: { status: "failed", failureCode: "order_mismatch" } },
    );
    return fail("unavailable", "We could not start the payment. No money has been taken. Please try again later.");
  }

  await PaymentModel.updateOne({ _id: created._id }, { $set: { providerOrderId: order.id } });
  await recordAuditEvent({
    actorId: actor.id,
    action: "payment.order_created",
    entityType: "payment",
    entityId: created._id,
    metadata: { programSlug: program.slug, amount: created.amount, currency: created.currency, mode: provider.mode },
  });
  const saved = await reload(created._id);
  return { ok: true, data: session(saved, await toView(saved)) };
}

// ---------- Applying verified provider data ----------

type ApplyOutcome =
  | "paid"
  | "already_paid"
  | "authorized"
  | "failed"
  | "unchanged"
  | "mismatch"
  | "transition_not_allowed"
  | "refund_not_supported";

/**
 * Applies AUTHENTICATED provider data to a local payment. Callers must have
 * verified the source (webhook signature, or checkout signature + API fetch,
 * or an API fetch during reconciliation).
 */
async function applyProviderPayment(
  payment: PaymentDoc,
  providerPayment: ProviderPayment,
  via: "checkout" | "webhook" | "reconciliation",
  actorId: string | null,
): Promise<ApplyOutcome> {
  if (!matchesExpected(providerPayment, payment)) {
    console.error("[payments] provider payment does not match the local order, amount or currency");
    if (payment.status !== "paid") {
      await PaymentModel.updateOne({ _id: payment._id, status: payment.status }, { $set: { attentionReason: "verification_mismatch" } });
    }
    await recordAuditEvent({
      actorId,
      action: "payment.verification_failed",
      entityType: "payment",
      entityId: payment._id,
      metadata: { via, reason: "mismatch" },
    });
    return "mismatch";
  }

  const target = statusForProviderState(providerPayment.state);
  if (target === null) {
    console.error("[payments] provider reports a refund; refunds are not implemented, follow up manually");
    return "refund_not_supported";
  }
  if (target === "paid") return markPaid(payment, providerPayment, via, actorId);
  if (target === payment.status) return "unchanged";
  if (!canTransition(payment.status, target)) return "transition_not_allowed";

  const update = await PaymentModel.updateOne(
    { _id: payment._id, status: payment.status },
    {
      $set: {
        status: target,
        providerPaymentId: providerPayment.id,
        ...(target === "failed" ? { failureCode: providerPayment.errorCode ?? "payment_failed" } : {}),
      },
    },
  );
  if (update.modifiedCount === 0) return "unchanged"; // changed concurrently; the next event or check sees the new state
  if (target === "failed" || target === "authorized") {
    await recordAuditEvent({
      actorId,
      action: target === "failed" ? "payment.failed" : "payment.authorized",
      entityType: "payment",
      entityId: payment._id,
      metadata: { via, ...(target === "failed" ? { failureCode: providerPayment.errorCode ?? "payment_failed" } : {}) },
    });
  }
  return target === "failed" ? "failed" : target === "authorized" ? "authorized" : "unchanged";
}

async function markPaid(
  payment: PaymentDoc,
  providerPayment: ProviderPayment,
  via: "checkout" | "webhook" | "reconciliation",
  actorId: string | null,
): Promise<ApplyOutcome> {
  // Compare-and-set: only from a state that allows "paid", and only for the exact order/amount/currency.
  const updated = await PaymentModel.findOneAndUpdate(
    {
      _id: payment._id,
      status: { $in: statusesAllowing("paid") },
      providerOrderId: providerPayment.orderId,
      amount: providerPayment.amount,
      currency: providerPayment.currency,
    },
    {
      $set: {
        status: "paid",
        providerPaymentId: providerPayment.id,
        paidAt: new Date(),
        verifiedVia: via,
        failureCode: null,
        attentionReason: null,
      },
    },
    { returnDocument: "after" },
  ).lean<PaymentDoc>();

  if (updated) {
    await recordAuditEvent({
      actorId,
      action: "payment.paid",
      entityType: "payment",
      entityId: payment._id,
      metadata: { via, amount: updated.amount, currency: updated.currency, mode: updated.mode },
    });
    await ensureEnrollment(updated);
    await notifyPaid(updated._id);
    return "paid";
  }

  const current = await reload(payment._id);
  if (current.status === "paid") {
    // Duplicate or late confirmation: finish an interrupted activation (and its notification) if needed.
    await ensureEnrollment(current);
    await notifyPaid(current._id);
    return "already_paid";
  }
  return "transition_not_allowed";
}

/** Payment confirmation (idempotent per payment), queued only for a verified "paid" record. */
async function notifyPaid(paymentId: Id): Promise<void> {
  const paid = await reload(paymentId);
  if (paid.status !== "paid") return;
  const program = await ProgramModel.findById(paid.programId).select("title").lean();
  await notifyPaymentConfirmed(paid, program?.title ?? "your program");
}

async function flagAttention(payment: PaymentDoc, reason: PaymentAttentionReason): Promise<void> {
  const update = await PaymentModel.updateOne(
    { _id: payment._id, status: "paid", enrollmentId: null, attentionReason: null },
    { $set: { attentionReason: reason } },
  );
  if (update.modifiedCount === 1) {
    console.error(`[payments] paid payment needs attention: ${reason}`);
    await recordAuditEvent({
      actorId: null,
      action: "payment.needs_attention",
      entityType: "payment",
      entityId: payment._id,
      metadata: { reason },
    });
  }
}

/**
 * Creates the paid enrollment for a verified payment, exactly once. Safe to
 * call repeatedly (it is the recovery step after an interruption).
 * Policy: access is granted only while the program is published. A payment
 * confirmed after the program was unpublished or archived is kept as paid,
 * grants nothing, and is flagged for an administrator (refund or follow-up).
 */
async function ensureEnrollment(payment: PaymentDoc): Promise<void> {
  if (payment.status !== "paid" || payment.enrollmentId || payment.attentionReason) return;

  const link = async (enrollmentId: Id) => {
    await PaymentModel.updateOne({ _id: payment._id, enrollmentId: null }, { $set: { enrollmentId } });
  };

  const existingForPayment = await EnrollmentModel.findOne({ paymentId: payment._id }).select("_id").lean();
  if (existingForPayment) return link(existingForPayment._id);

  const program = await ProgramModel.findById(payment.programId).select("status slug title").lean();
  if (!program || program.status !== "published") return flagAttention(payment, "program_unavailable");

  let enrollmentId: Id;
  try {
    const created = await EnrollmentModel.create({
      studentId: payment.studentId,
      programId: payment.programId,
      status: "active",
      source: "payment",
      paymentId: payment._id,
      amountPaid: payment.amount,
      currency: payment.currency,
      enrolledAt: new Date(),
    });
    enrollmentId = created._id;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    // Either a concurrent run created it for this payment, or the student already has a current enrollment.
    const again = await EnrollmentModel.findOne({ paymentId: payment._id }).select("_id").lean();
    if (again) return link(again._id);
    return flagAttention(payment, "already_enrolled");
  }

  await link(enrollmentId);
  await recordAuditEvent({
    actorId: null,
    action: "enrollment.created",
    entityType: "enrollment",
    entityId: enrollmentId,
    metadata: { source: "payment", paymentId: payment._id.toString(), programSlug: program.slug },
  });
  await notifyEnrollmentActivated({ _id: enrollmentId, studentId: payment.studentId }, program.title);
}

// ---------- Checkout verification ----------

/**
 * Handles what the checkout returns. The signature proves the provider issued
 * this payment for OUR order; the payment is then fetched from the provider to
 * confirm capture, amount and currency. If that fetch fails, the payment stays
 * pending (never paid) until a webhook or a later check confirms it.
 */
export async function verifyCheckoutPayment(actor: Actor, input: unknown): Promise<ServiceResult<PaymentView>> {
  assertStudent(actor);
  const parsed = verifyCheckoutSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "The payment response was incomplete.");
  const { paymentId, providerOrderId, providerPaymentId, signature } = parsed.data;

  const provider = getPaymentProvider();
  if (!provider) return fail("unavailable", "Payments cannot be confirmed at the moment. Your payment, if any, will be checked later.");

  await ready();
  const limit = await consumeRateLimit(RATE_LIMITS.paymentVerifyPerAccount, actor.id);
  if (!limit.allowed) return fail("rate_limited", "Too many requests. Please wait a few minutes.");

  // Only the student's own payment; another student's id behaves like a missing one.
  const payment = await PaymentModel.findOne({ _id: paymentId, studentId: actor.id }).lean<PaymentDoc>();
  if (!payment) return fail("not_found", "Payment not found.");
  if (payment.provider !== provider.name || payment.mode !== provider.mode) {
    return fail("conflict", "This payment was started with different payment settings.");
  }
  if (payment.status === "paid") {
    await ensureEnrollment(payment);
    return { ok: true, data: await toView(await reload(payment._id)) };
  }

  const signatureValid =
    payment.providerOrderId !== null &&
    providerOrderId === payment.providerOrderId &&
    provider.verifyCheckoutSignature({ orderId: payment.providerOrderId, paymentId: providerPaymentId, signature });
  if (!signatureValid) {
    await recordAuditEvent({
      actorId: actor.id,
      action: "payment.verification_failed",
      entityType: "payment",
      entityId: payment._id,
      metadata: { via: "checkout", reason: "signature" },
    });
    return fail("invalid", "We could not verify this payment response. If money was taken, it will be confirmed automatically.");
  }

  let providerPayment: ProviderPayment;
  try {
    providerPayment = await provider.fetchPayment(providerPaymentId);
  } catch (error) {
    logProviderProblem("fetch payment", error);
    // Authentic but unconfirmed: wait for the webhook or a later check.
    if (canTransition(payment.status, "pending")) {
      await PaymentModel.updateOne(
        { _id: payment._id, status: payment.status },
        { $set: { status: "pending", providerPaymentId } },
      ).catch((updateError: unknown) => {
        if (!isDuplicateKeyError(updateError)) throw updateError;
      });
    }
    return { ok: true, data: await toView(await reload(payment._id)) };
  }

  await applyProviderPayment(payment, providerPayment, "checkout", actor.id);
  return { ok: true, data: await toView(await reload(payment._id)) };
}

// ---------- Reconciliation ----------

/**
 * Asks the provider for the current state of an order and applies it with the
 * same rules as webhooks. Students may check their own payments; admins any
 * (audited). Never changes a status without provider data.
 */
export async function reconcilePayment(actor: Actor, paymentId: string): Promise<ServiceResult<PaymentView>> {
  if (actor.role === "admin") assertAdmin(actor);
  else assertStudent(actor);
  if (!isValidObjectIdString(paymentId)) return fail("not_found", "Payment not found.");

  await ready();
  const payment = await PaymentModel.findOne(
    actor.role === "admin" ? { _id: paymentId } : { _id: paymentId, studentId: actor.id },
  ).lean<PaymentDoc>();
  if (!payment) return fail("not_found", "Payment not found.");

  const limit = await consumeRateLimit(RATE_LIMITS.paymentReconcilePerAccount, actor.id);
  if (!limit.allowed) return fail("rate_limited", "Too many checks. Please wait a few minutes.");

  const before = payment.status;
  let outcome: ApplyOutcome | "no_attempt" | "nothing_to_do" = "nothing_to_do";

  if (payment.status === "paid") {
    await ensureEnrollment(payment);
  } else if (canTransition(payment.status, "paid") && payment.providerOrderId) {
    const provider = getPaymentProvider();
    if (!provider) return fail("unavailable", "Payments cannot be checked at the moment.");
    if (payment.provider !== provider.name || payment.mode !== provider.mode) {
      return fail("conflict", "This payment was created with different payment settings.");
    }
    let attempts: ProviderPayment[];
    try {
      attempts = await provider.fetchOrderPayments(payment.providerOrderId);
    } catch (error) {
      logProviderProblem("fetch order payments", error);
      return fail("unavailable", "We could not reach the payment provider. The payment stays pending; please check again later.");
    }
    const pick =
      attempts.find((item) => item.state === "captured") ??
      attempts.find((item) => item.state === "authorized") ??
      // All attempts failed: report the failure (a later capture can still move it to paid).
      (attempts.length > 0 && attempts.every((item) => item.state === "failed") ? attempts[attempts.length - 1] : undefined);
    outcome = pick ? await applyProviderPayment(payment, pick, "reconciliation", actor.id) : "no_attempt";
  }

  const after = await reload(payment._id);
  if (actor.role === "admin") {
    await recordAuditEvent({
      actorId: actor.id,
      action: "payment.reconciled",
      entityType: "payment",
      entityId: payment._id,
      metadata: { before, after: after.status, outcome, enrollmentLinked: after.enrollmentId !== null },
    });
  }
  return { ok: true, data: await toView(after) };
}

// ---------- Webhooks ----------

const HANDLED_EVENTS = new Set(["payment.captured", "order.paid", "payment.authorized", "payment.failed"]);
/** A delivery still "processing" after this long is assumed to have crashed and may be retried. */
const STALE_PROCESSING_MS = 60 * 1000;

export type WebhookResult = { status: number; body: Record<string, unknown> };

/**
 * Verifies and processes one webhook delivery. Response codes follow the
 * provider's retry behaviour: 2xx = done (including duplicates and events we
 * deliberately ignore); 4xx = rejected (bad signature or body); 5xx/409 =
 * temporary problem, so the provider retries later.
 */
export async function processPaymentWebhook(rawBody: string, headers: Headers): Promise<WebhookResult> {
  const provider = getPaymentProvider();
  if (!provider) return { status: 503, body: { error: "payments_not_configured" } };

  // Signature first, over the exact raw bytes, before parsing or touching the database.
  if (!provider.verifyWebhookSignature(rawBody, headers.get("x-razorpay-signature"))) {
    console.warn("[payments] webhook rejected: invalid signature");
    return { status: 400, body: { error: "invalid_signature" } };
  }
  const event = provider.parseWebhookEvent(rawBody, headers);
  if (!event) return { status: 400, body: { error: "malformed_event" } };

  await ready();

  // Claim the event id; a second delivery of a finished event is acknowledged without reprocessing.
  let claimed: { _id: Id } | null = null;
  try {
    claimed = await WebhookEventModel.create({ provider: provider.name, eventId: event.eventId, eventType: event.type });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await WebhookEventModel.findOne({ provider: provider.name, eventId: event.eventId }).lean();
    if (!existing) return { status: 409, body: { error: "retry" } };
    if (existing.status === "processed" || existing.status === "ignored") {
      return { status: 200, body: { received: true, duplicate: true } };
    }
    if (existing.status === "processing" && Date.now() - existing.updatedAt.getTime() < STALE_PROCESSING_MS) {
      return { status: 409, body: { error: "in_progress" } };
    }
    claimed = await WebhookEventModel.findOneAndUpdate(
      { _id: existing._id, status: existing.status, updatedAt: existing.updatedAt },
      { $set: { status: "processing" }, $inc: { attempts: 1 } },
    ).lean();
    if (!claimed) return { status: 409, body: { error: "in_progress" } };
  }

  try {
    const { outcome, paymentId } = await handleWebhookEvent(provider, event.type, event.payment);
    const ignored = outcome === "event_not_handled" || outcome === "unknown_order" || outcome === "no_payment" || outcome === "mode_mismatch";
    await WebhookEventModel.updateOne(
      { _id: claimed._id },
      { $set: { status: ignored ? "ignored" : "processed", outcome, paymentId } },
    );
    return { status: 200, body: { received: true } };
  } catch {
    console.error("[payments] webhook processing failed; the provider will retry");
    await WebhookEventModel.updateOne({ _id: claimed._id }, { $set: { status: "failed", outcome: "error" } }).catch(() => undefined);
    return { status: 500, body: { error: "processing_failed" } };
  }
}

async function handleWebhookEvent(
  provider: PaymentProvider,
  type: string,
  providerPayment: ProviderPayment | null,
): Promise<{ outcome: string; paymentId: Id | null }> {
  if (!HANDLED_EVENTS.has(type)) return { outcome: "event_not_handled", paymentId: null };
  if (!providerPayment?.orderId) return { outcome: "no_payment", paymentId: null };

  const payment = await PaymentModel.findOne({ provider: provider.name, providerOrderId: providerPayment.orderId }).lean<PaymentDoc>();
  // Not ours (e.g. another integration on the same merchant account): acknowledge and ignore.
  if (!payment) return { outcome: "unknown_order", paymentId: null };
  if (payment.mode !== provider.mode) return { outcome: "mode_mismatch", paymentId: payment._id };

  const outcome = await applyProviderPayment(payment, providerPayment, "webhook", null);
  return { outcome, paymentId: payment._id };
}

// ---------- Reading ----------

/** A payment for its own student or an admin; null otherwise (no probing other students' payments). */
export async function getPaymentForViewer(actor: Actor, paymentId: string): Promise<PaymentView | null> {
  if (!isValidObjectIdString(paymentId)) return null;
  await connectToDatabase();
  const doc = await PaymentModel.findById(paymentId).lean<PaymentDoc>();
  if (!doc) return null;
  if (actor.role !== "admin" && doc.studentId.toString() !== actor.id) return null;
  return toView(doc);
}

function paginate(total: number, requested: number | undefined, size: number) {
  const totalPages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Math.floor(requested ?? 1) || 1), totalPages);
  return { totalPages, page, skip: (page - 1) * size };
}

/** The student's own payment records (not inferred from enrollments), newest first. */
export async function listOwnPayments(actor: Actor, requestedPage?: number) {
  assertStudent(actor);
  await connectToDatabase();
  const query = { studentId: new Types.ObjectId(actor.id) };
  const total = await PaymentModel.countDocuments(query);
  const { totalPages, page, skip } = paginate(total, requestedPage, STUDENT_PAYMENTS_PAGE_SIZE);
  const docs = await PaymentModel.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(STUDENT_PAYMENTS_PAGE_SIZE)
    .lean<PaymentDoc[]>();
  return { total, totalPages, page, items: await toViews(docs) };
}

export type AdminPaymentItem = PaymentView & {
  student: { id: string; name: string; email: string };
  providerPaymentId: string | null;
  verifiedVia: string | null;
};

/** Read-only payment list for administrators. There is no way to set a status from here. */
export async function listPaymentsForAdmin(
  actor: Actor,
  filters: { status?: PaymentStatus | "attention"; mode?: PaymentMode; programId?: string; page?: number } = {},
) {
  assertAdmin(actor);
  await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (filters.status === "attention") query.attentionReason = { $type: "string" };
  else if (filters.status) query.status = filters.status;
  if (filters.mode) query.mode = filters.mode;
  if (filters.programId && isValidObjectIdString(filters.programId)) query.programId = new Types.ObjectId(filters.programId);

  const total = await PaymentModel.countDocuments(query);
  const { totalPages, page, skip } = paginate(total, filters.page, ADMIN_PAYMENTS_PAGE_SIZE);
  const docs = await PaymentModel.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(ADMIN_PAYMENTS_PAGE_SIZE).lean<PaymentDoc[]>();
  const [views, students] = await Promise.all([
    toViews(docs),
    UserModel.find({ _id: { $in: docs.map((doc) => doc.studentId) } }).select("name email").lean(),
  ]);
  const studentBy = new Map(students.map((student) => [student._id.toString(), student]));
  return {
    total,
    totalPages,
    page,
    items: docs.map((doc, index): AdminPaymentItem => {
      const student = studentBy.get(doc.studentId.toString());
      return {
        ...views[index],
        student: { id: doc.studentId.toString(), name: student?.name ?? "Unknown student", email: student?.email ?? "" },
        providerPaymentId: doc.providerPaymentId,
        verifiedVia: doc.verifiedVia ?? null,
      };
    }),
  };
}

/** Count for the admin overview. */
export async function countPaymentsNeedingAttention(actor: Actor): Promise<number> {
  assertAdmin(actor);
  await connectToDatabase();
  return PaymentModel.countDocuments({ attentionReason: { $type: "string" } });
}

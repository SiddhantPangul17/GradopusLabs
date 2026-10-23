import "server-only";
import { getCertificateConfig } from "@/lib/certificates/config";
import { connectToDatabase } from "@/lib/db/mongodb";
import { getEmailConfig } from "@/lib/email/config";
import { getServerEnv } from "@/lib/env";
import { getPaymentConfig } from "@/lib/payments/config";
import { assertAdmin, type Actor } from "@/lib/services/authorization";
import { EmailJobModel } from "@/models/email-job";
import { PaymentModel } from "@/models/payment";
import { WebhookEventModel } from "@/models/webhook-event";

/*
 * Operational status for administrators. Server-side checks only; a handful
 * of indexed counts. Never returns hostnames, connection strings, secrets,
 * provider responses or stack traces. Third-party services (Razorpay, the
 * email provider) are NOT contacted, so their own health is reported as
 * "not checked"; only our side (configuration, queues, failures) is shown.
 * No payments or emails are ever sent by a health check.
 */

export type Health = "healthy" | "degraded" | "unavailable" | "not_configured" | "unknown";
export type Indicator = { key: string; label: string; status: Health; summary: string; facts: { label: string; value: string }[] };

const HOUR = 3_600_000;
const STUCK_MS = 10 * 60_000;

function age(from: Date | null | undefined, now: number): string {
  if (!from) return "—";
  const minutes = Math.max(0, Math.round((now - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

export async function getOperationalStatus(actor: Actor): Promise<{ checkedAt: string; indicators: Indicator[] }> {
  assertAdmin(actor);
  const now = Date.now();
  const indicators: Indicator[] = [
    { key: "app", label: "Application", status: "healthy", summary: "This server is running and responded to this request.", facts: [] },
  ];

  // Database
  let databaseUp = false;
  try {
    const started = Date.now();
    const mongoose = await connectToDatabase();
    await mongoose.connection.db!.admin().command({ ping: 1 });
    databaseUp = true;
    const latency = Date.now() - started;
    indicators.push({
      key: "database",
      label: "Database",
      status: latency > 1500 ? "degraded" : "healthy",
      summary: latency > 1500 ? "Reachable but slow to respond." : "Connected and responding.",
      facts: [{ label: "Response time", value: `${latency} ms` }],
    });
  } catch {
    indicators.push({ key: "database", label: "Database", status: "unavailable", summary: "The database could not be reached. Details are in the server log.", facts: [] });
  }
  const dbUnknown = (key: string, label: string): Indicator => ({ key, label, status: "unknown", summary: "Cannot be checked while the database is unavailable.", facts: [] });

  // Email queue
  const email = getEmailConfig();
  if (!databaseUp) indicators.push(dbUnknown("email", "Email queue"));
  else {
    const [pending, oldestDue, failedDay, failedWeek, stuck, lastSent] = await Promise.all([
      EmailJobModel.countDocuments({ status: "pending" }),
      EmailJobModel.findOne({ status: "pending", nextAttemptAt: { $lte: new Date(now) } }).sort({ nextAttemptAt: 1 }).select("nextAttemptAt").lean(),
      EmailJobModel.countDocuments({ status: "failed", updatedAt: { $gte: new Date(now - 24 * HOUR) } }),
      EmailJobModel.countDocuments({ status: "failed", updatedAt: { $gte: new Date(now - 7 * 24 * HOUR) } }),
      EmailJobModel.countDocuments({ status: "processing", lockedUntil: { $lt: new Date(now - STUCK_MS) } }),
      EmailJobModel.findOne({ status: "sent" }).sort({ sentAt: -1 }).select("sentAt").lean(),
    ]);
    const facts = [
      { label: "Waiting to send", value: String(pending) },
      { label: "Oldest due email waiting", value: age(oldestDue?.nextAttemptAt, now) },
      { label: "Failed (24 h / 7 days)", value: `${failedDay} / ${failedWeek}` },
      { label: "Stuck in processing", value: String(stuck) },
      { label: "Last accepted by provider", value: lastSent?.sentAt ? `${age(lastSent.sentAt, now)} ago` : "never" },
    ];
    if (email.status !== "ready") {
      indicators.push({
        key: "email",
        label: "Email queue",
        status: email.status === "disabled" ? "not_configured" : "degraded",
        summary: `${email.reason} Emails are queued but not sent.`,
        facts,
      });
    } else {
      const backlog = oldestDue && now - oldestDue.nextAttemptAt.getTime() > 30 * 60_000;
      const degraded = failedDay > 0 || stuck > 0 || backlog;
      indicators.push({
        key: "email",
        label: "Email queue",
        status: degraded ? "degraded" : "healthy",
        summary: degraded
          ? "Some emails failed recently or are waiting too long. See Admin → Emails."
          : "No recent failures or backlog. (The email provider itself is not contacted by this check.)",
        facts,
      });
    }
  }

  // Scheduler
  indicators.push(
    getServerEnv().CRON_SECRET
      ? { key: "scheduler", label: "Email scheduler", status: "unknown", summary: "CRON_SECRET is set. Scheduler runs are not recorded, so whether your scheduler calls the processor cannot be confirmed here; check “Last accepted by provider”.", facts: [] }
      : { key: "scheduler", label: "Email scheduler", status: "not_configured", summary: "CRON_SECRET is not set: queued emails are only attempted after requests or manually.", facts: [] },
  );

  // Payments
  const payment = getPaymentConfig();
  if (payment.status === "disabled") {
    indicators.push({ key: "payments", label: "Payments", status: "not_configured", summary: "Online payments are switched off.", facts: [] });
  } else if (!databaseUp) indicators.push(dbUnknown("payments", "Payments"));
  else {
    const [failedEvents, stuckEvents, attention, staleOpen] = await Promise.all([
      WebhookEventModel.countDocuments({ status: "failed", updatedAt: { $gte: new Date(now - 7 * 24 * HOUR) } }),
      WebhookEventModel.countDocuments({ status: "processing", updatedAt: { $lt: new Date(now - STUCK_MS) } }),
      PaymentModel.countDocuments({ attentionReason: { $type: "string" } }),
      // Checkout returned a payment but it is still unconfirmed after an hour: needs "check with provider".
      PaymentModel.countDocuments({ status: { $in: ["pending", "authorized"] }, updatedAt: { $lt: new Date(now - HOUR) } }),
    ]);
    const configured = payment.status === "ready";
    const degraded = !configured || failedEvents > 0 || stuckEvents > 0 || attention > 0 || staleOpen > 0;
    indicators.push({
      key: "payments",
      label: "Payments",
      status: degraded ? "degraded" : "healthy",
      summary: !configured
        ? `Misconfigured: ${"reason" in payment ? payment.reason : ""}`
        : degraded
          ? "Some payments or webhook deliveries need attention. See Admin → Payments."
          : `No failed webhooks or unconfirmed payments (${payment.mode} mode). Razorpay itself is not contacted by this check.`,
      facts: [
        { label: "Mode", value: configured ? payment.mode : "—" },
        { label: "Failed webhook deliveries (7 days)", value: String(failedEvents) },
        { label: "Webhook deliveries stuck", value: String(stuckEvents) },
        { label: "Payments needing attention", value: String(attention) },
        { label: "Unconfirmed for over 1 hour", value: String(staleOpen) },
      ],
    });
  }

  // Certificates
  const certificate = getCertificateConfig();
  indicators.push(
    certificate.ready
      ? { key: "certificates", label: "Certificate issuing", status: "healthy", summary: "Configured. Verification reads the database. (Issuing errors are not recorded separately.)", facts: [] }
      : { key: "certificates", label: "Certificate issuing", status: "not_configured", summary: `${certificate.reason} Verification of existing certificates still works.`, facts: [] },
  );

  // Errors
  indicators.push({
    key: "errors",
    label: "Application errors",
    status: "unknown",
    summary: "Errors are written to the server log only (no error tracker is configured). Check your hosting provider's logs.",
    facts: [],
  });

  return { checkedAt: new Date(now).toISOString(), indicators };
}

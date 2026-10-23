import "server-only";
import { EmailPermanentError, EmailTransientError, type EmailProvider, type OutgoingEmail } from "@/lib/email/provider";

/*
 * Resend (https://resend.com/docs/api-reference/emails/send-email), via its
 * REST API: POST https://api.resend.com/emails with a Bearer API key.
 * `Idempotency-Key` (kept by Resend for 24 hours) makes retries of the same
 * job safe; our retry schedule ends well within that window.
 */

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

/** Error names Resend documents as temporary (retry later). Everything else 4xx is permanent. */
const TRANSIENT = new Set([
  "rate_limit_exceeded",
  "daily_quota_exceeded",
  "concurrent_idempotent_requests",
  "resource_locked",
  "application_error",
  "service_unavailable",
]);

function safeCode(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[a-z_]{1,64}$/.test(value) ? value : fallback;
}

export class ResendProvider implements EmailProvider {
  private readonly settings: { apiKey: string; from: string; replyTo: string | null };

  constructor(settings: { apiKey: string; from: string; replyTo: string | null }) {
    this.settings = { apiKey: settings.apiKey, from: settings.from, replyTo: settings.replyTo };
  }

  async send(message: OutgoingEmail): Promise<{ id: string }> {
    const replyTo = message.replyTo ?? this.settings.replyTo;
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.settings.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      throw new EmailTransientError("network_error");
    }

    let data: { id?: unknown; name?: unknown } | null = null;
    try {
      data = await response.json();
    } catch {
      // Non-JSON: decided by status below.
    }
    if (response.ok) {
      if (typeof data?.id === "string" && data.id.length > 0 && data.id.length <= 100) return { id: data.id };
      // Accepted status without an id: treat as unclear and retry (the idempotency key prevents a duplicate).
      throw new EmailTransientError("unexpected_response");
    }
    const code = safeCode(data?.name, `http_${response.status}`);
    if (response.status >= 500 || response.status === 429 || TRANSIENT.has(code)) throw new EmailTransientError(code);
    throw new EmailPermanentError(code);
  }
}

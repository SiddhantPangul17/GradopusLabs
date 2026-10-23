import "server-only";
import type { EmailConfig } from "@/lib/email/config";
import { ResendProvider } from "@/lib/email/resend";

/*
 * Provider-independent email interface. Only this file knows which provider
 * is configured; templates, the outbox and business services never do.
 */

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Stable per job, so a retry after an unclear failure is not delivered twice (provider-side dedupe). */
  idempotencyKey: string;
};

export interface EmailProvider {
  /** Resolves with the provider's message id ONLY when the provider accepted the message. */
  send(message: OutgoingEmail): Promise<{ id: string }>;
}

/** Worth retrying later (network, timeout, rate limit, provider outage). */
export class EmailTransientError extends Error {
  constructor(readonly code: string) {
    super(`Email delivery failed temporarily (${code})`);
    this.name = "EmailTransientError";
  }
}

/** Will not succeed if retried unchanged (invalid recipient, bad credentials, quota/plan). */
export class EmailPermanentError extends Error {
  constructor(readonly code: string) {
    super(`Email delivery failed permanently (${code})`);
    this.name = "EmailPermanentError";
  }
}

export function createEmailProvider(config: Extract<EmailConfig, { status: "ready" }>): EmailProvider {
  switch (config.provider) {
    case "resend":
      return new ResendProvider({ apiKey: config.apiKey, from: config.from, replyTo: config.replyTo });
  }
}

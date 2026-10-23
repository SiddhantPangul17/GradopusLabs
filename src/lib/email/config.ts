import "server-only";
import { getServerEnv, getSiteUrl, isSiteUrlConfigured } from "@/lib/env";

/*
 * Email is OFF unless a provider, API key and verified sender are configured.
 * In production, links in emails must use the public https SITE_URL.
 * Nothing is ever reported as sent unless the provider accepted it.
 */

export type EmailConfig =
  | { status: "ready"; provider: "resend"; apiKey: string; from: string; replyTo: string | null; siteUrl: URL }
  | { status: "disabled" | "misconfigured"; reason: string };

export function getEmailConfig(): EmailConfig {
  const env = getServerEnv();
  if (!env.EMAIL_PROVIDER) return { status: "disabled", reason: "EMAIL_PROVIDER is not set." };
  const missing = (["EMAIL_API_KEY", "EMAIL_FROM"] as const).filter((key) => !env[key]);
  if (missing.length > 0) return { status: "misconfigured", reason: `Missing ${missing.join(", ")}.` };
  if (process.env.NODE_ENV === "production") {
    if (!isSiteUrlConfigured()) return { status: "misconfigured", reason: "SITE_URL must be set so emails link to the public site." };
    if (getSiteUrl().protocol !== "https:") return { status: "misconfigured", reason: "SITE_URL must use https in production." };
  }
  return {
    status: "ready",
    provider: env.EMAIL_PROVIDER,
    apiKey: env.EMAIL_API_KEY as string,
    from: env.EMAIL_FROM as string,
    replyTo: env.EMAIL_REPLY_TO ?? null,
    siteUrl: getSiteUrl(),
  };
}

export function isEmailDeliveryConfigured(): boolean {
  return getEmailConfig().status === "ready";
}

/** Absolute link to a path on this site, for emails. */
export function siteLink(path: string): string {
  return new URL(path, getSiteUrl()).toString();
}

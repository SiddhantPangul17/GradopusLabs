import "server-only";
import { getServerEnv, getSiteUrl, isSiteUrlConfigured } from "@/lib/env";

/*
 * Issuing certificates needs:
 * - CERTIFICATE_TOKEN_KEY, to store verification tokens encrypted; and
 * - in production, an https SITE_URL, because QR codes and printed links point
 *   to it. A development hostname is never printed on a production certificate.
 * Public verification only needs the database.
 */

export type CertificateConfig = { ready: true; key: Buffer; siteUrl: URL } | { ready: false; reason: string };

export function getCertificateConfig(): CertificateConfig {
  const env = getServerEnv();
  if (!env.CERTIFICATE_TOKEN_KEY) return { ready: false, reason: "CERTIFICATE_TOKEN_KEY is not set." };
  if (process.env.NODE_ENV === "production") {
    if (!isSiteUrlConfigured()) return { ready: false, reason: "SITE_URL must be set to the public https address in production." };
    if (getSiteUrl().protocol !== "https:") return { ready: false, reason: "SITE_URL must use https in production." };
  }
  return { ready: true, key: Buffer.from(env.CERTIFICATE_TOKEN_KEY, "base64"), siteUrl: getSiteUrl() };
}

/** The public verification link encoded in the QR code. */
export function verificationUrl(token: string, siteUrl: URL): string {
  return new URL(`/verify/${token}`, siteUrl).toString();
}

import "server-only";
import { isIP } from "node:net";
import { z } from "zod";

/**
 * Server-side environment validation.
 *
 * All variables are optional so the site renders locally with no
 * configuration (in development, programs then come from fixtures). Values that ARE set must be well-formed, so typos fail
 * loudly instead of surfacing later as confusing runtime errors.
 *
 * Features that depend on a variable should call `requireServerEnv()` at the
 * point of use, which throws a clear error only when that feature runs.
 *
 * Never import this module from a Client Component; `server-only` turns that
 * mistake into a build error.
 */

// Treat empty strings from `.env` files (e.g. `MONGODB_URI=`) as unset.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const serverEnvSchema = z.object({
  SITE_URL: optional(z.url({ protocol: /^https?$/ })),
  MONGODB_URI: optional(z.string().regex(/^mongodb(\+srv)?:\/\//, "Must be a mongodb:// or mongodb+srv:// URI")),
  MONGODB_DB_NAME: optional(
    z.string().regex(/^[A-Za-z0-9_-]{1,63}$/, "Use 1-63 letters, digits, hyphens or underscores"),
  ),
  // Optional DNS servers (comma-separated IPs) for the mongodb+srv:// lookup, for machines where
  // Node's resolver cannot reach a DNS server (e.g. it uses 127.0.0.1). Not needed on most hosts.
  MONGODB_DNS_SERVERS: optional(
    z
      .string()
      .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
      .refine((list) => list.length > 0 && list.length <= 4 && list.every((ip) => isIP(ip) !== 0), "Use 1-4 IP addresses, comma-separated (e.g. 8.8.8.8,1.1.1.1)"),
  ),
  AUTH_SECRET: optional(z.string().min(32, "Must be at least 32 characters")),
  // Read directly by Auth.js; validated here so typos fail clearly.
  AUTH_URL: optional(z.url({ protocol: /^https?$/ })),
  AUTH_TRUST_HOST: optional(z.enum(["true", "false"])),
  ADMIN_EMAIL: optional(z.email()),
  // Payments (src/lib/payments/config.ts). Secrets are server-only; never use NEXT_PUBLIC_ for them.
  PAYMENT_PROVIDER: optional(z.enum(["razorpay"])),
  // Defaults to "test". Live payments need PAYMENT_MODE=live AND live keys; keys alone never enable them.
  PAYMENT_MODE: optional(z.enum(["test", "live"])),
  PAYMENT_KEY_ID: optional(z.string().regex(/^[A-Za-z0-9_]{8,64}$/, "Unexpected key id format")),
  PAYMENT_KEY_SECRET: optional(z.string().min(8, "Too short").max(256)),
  PAYMENT_WEBHOOK_SECRET: optional(z.string().min(8, "Too short").max(256)),
  // Email (src/lib/email/config.ts). Secrets are server-only.
  EMAIL_PROVIDER: optional(z.enum(["resend"])),
  EMAIL_API_KEY: optional(z.string().min(8, "Too short").max(256)),
  // "Gradopus Labs <noreply@your-verified-domain>" or a bare address on a domain verified with the provider.
  EMAIL_FROM: optional(
    z
      .string()
      .max(200)
      .regex(/^(?:[^\r\n<>"]{1,80} <[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/, 'Use an address or "Name <address>"'),
  ),
  EMAIL_REPLY_TO: optional(z.email()),
  // Bearer secret for the scheduled outbox processor (POST /api/notifications/process).
  CRON_SECRET: optional(z.string().min(32, "Must be at least 32 characters")),
  // Certificates (src/lib/certificates/config.ts): 32 random bytes, base64. Encrypts stored verification tokens.
  CERTIFICATE_TOKEN_KEY: optional(
    z.string().refine((value) => Buffer.from(value, "base64").length === 32, "Must be 32 random bytes, base64-encoded"),
  ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    // Report variable names and problems only, never the values.
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

/** Returns a variable that a feature cannot run without, or throws. */
export function requireServerEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = getServerEnv()[key];
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${key}. See .env.example.`);
  }
  return value as NonNullable<ServerEnv[K]>;
}

const LOCAL_SITE_URL = "http://localhost:3000";

/**
 * Canonical site URL, used for metadata now and for absolute links (e.g.
 * certificate verification QR codes) later. Falls back to localhost so local
 * development needs no configuration; set SITE_URL in every deployment.
 */
export function getSiteUrl(): URL {
  return new URL(getServerEnv().SITE_URL ?? LOCAL_SITE_URL);
}

const DEFAULT_DB_NAME = "krushitech";

/** MongoDB settings, or null when MONGODB_URI is not configured. */
export function getDatabaseConfig(): { uri: string; dbName: string; dnsServers: string[] | null } | null {
  const env = getServerEnv();
  if (!env.MONGODB_URI) return null;
  return { uri: env.MONGODB_URI, dbName: env.MONGODB_DB_NAME ?? DEFAULT_DB_NAME, dnsServers: env.MONGODB_DNS_SERVERS ?? null };
}

/** Accounts need both a signing secret and the database. Without them, sign-in is disabled (not faked). */
export function isAuthConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.AUTH_SECRET && env.MONGODB_URI);
}

/** True only when SITE_URL is explicitly set (i.e. a real domain is configured). */
export function isSiteUrlConfigured(): boolean {
  return getServerEnv().SITE_URL !== undefined;
}

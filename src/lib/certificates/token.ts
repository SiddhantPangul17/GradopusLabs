import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/*
 * Verification tokens (the secret part of the QR link /verify/<token>).
 *
 * - 32 bytes from the OS CSPRNG, base64url-encoded (43 characters).
 * - Independent of the readable certificate number and of database ids.
 * - The database stores a SHA-256 hash for lookups, so a database leak
 *   alone does not reveal working verification links.
 * - So that the PDF (and its QR code) can be regenerated identically, the
 *   token is also stored ENCRYPTED with AES-256-GCM under CERTIFICATE_TOKEN_KEY,
 *   which lives only in the server environment.
 * Never log raw tokens.
 */

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isVerificationTokenFormat(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

const VERSION = "v1";

/** AES-256-GCM: "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function sealToken(token: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Returns the token, or null if the value was tampered with or the key is wrong. */
export function openToken(sealed: string, key: Buffer): string | null {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const token = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    return isVerificationTokenFormat(token) ? token : null;
  } catch {
    return null;
  }
}

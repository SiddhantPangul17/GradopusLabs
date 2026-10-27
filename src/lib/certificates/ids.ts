import { CERTIFICATE_ID_PATTERN } from "@/lib/constants";

/*
 * Readable certificate numbers: PREFIX-YEAR-SEQUENCE, e.g. GOL-2026-000001.
 * - PREFIX: brand.certificate.prefix (no per-program code: programs have no
 *   reliable short-code mapping, and a wrong code would be worse than none).
 * - YEAR: the issue year in India Standard Time.
 * - SEQUENCE: from an atomic per-prefix-and-year counter (see
 *   allocateCertificateId in certificate-service). Numbers are never reused,
 *   even after revocation, supersession or a failed insert (gaps are fine).
 * The number is public and guessable by design; it is NOT the verification
 * secret (see token.ts).
 */

export function formatCertificateId(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(6, "0")}`;
}

/** Issue year in IST, so certificates issued just after midnight on 1 January IST get the new year. */
export function issueYear(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-IN", { year: "numeric", timeZone: "Asia/Kolkata" }).format(date));
}

/** Normalises user input ("gol 2026 000001", " GOL-2026-000001 ") or returns null. */
export function normalizeCertificateId(input: string): string | null {
  const compact = input.trim().toUpperCase().replace(/[\s_–—]+/g, "-").replace(/-+/g, "-");
  return CERTIFICATE_ID_PATTERN.test(compact) ? compact : null;
}

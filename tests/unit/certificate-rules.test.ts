import { randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { freshModules } from "../helpers";
import { formatCertificateId, issueYear, normalizeCertificateId } from "@/lib/certificates/ids";
import { renderCertificatePdf } from "@/lib/certificates/pdf";
import { isPrintableOnCertificate } from "@/lib/certificates/printable";
import { generateVerificationToken, hashVerificationToken, isVerificationTokenFormat, openToken, sealToken } from "@/lib/certificates/token";
import { CERTIFICATE_ID_PATTERN } from "@/lib/constants";
import { issueCertificateSchema, revokeCertificateSchema } from "@/lib/validation/certificate";

describe("verification tokens", () => {
  it("are 32 random bytes, URL-safe, unique and unrelated to the certificate number", () => {
    const tokens = new Set(Array.from({ length: 2000 }, generateVerificationToken));
    expect(tokens.size).toBe(2000);
    for (const token of [...tokens].slice(0, 50)) {
      expect(isVerificationTokenFormat(token)).toBe(true);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      expect(token).not.toMatch(/KT-\d{4}/);
    }
  });

  it("are stored as a hash, not in plaintext", () => {
    const token = generateVerificationToken();
    const hash = hashVerificationToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashVerificationToken(token)).toBe(hash);
  });

  it("encrypted copies open only with the right key and are tamper-evident", () => {
    const key = randomBytes(32);
    const token = generateVerificationToken();
    const sealed = sealToken(token, key);
    expect(sealed).not.toContain(token);
    expect(openToken(sealed, key)).toBe(token);
    expect(openToken(sealed, randomBytes(32))).toBeNull();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered-ciphertext").toString("base64url");
    expect(openToken(parts.join("."), key)).toBeNull();
    expect(openToken("garbage", key)).toBeNull();
    // Each seal uses a fresh IV.
    expect(sealToken(token, key)).not.toBe(sealed);
  });
});

describe("certificate numbers", () => {
  it("formats PREFIX-YEAR-SEQUENCE", () => {
    expect(formatCertificateId("KT", 2026, 1)).toBe("KT-2026-000001");
    expect(formatCertificateId("KT", 2026, 1234567)).toBe("KT-2026-1234567");
    expect(CERTIFICATE_ID_PATTERN.test(formatCertificateId("KT", 2026, 42))).toBe(true);
  });

  it("normalises typed input and rejects anything else", () => {
    expect(normalizeCertificateId(" kt-2026-000001 ")).toBe("KT-2026-000001");
    expect(normalizeCertificateId("KT 2026 000001")).toBe("KT-2026-000001");
    for (const bad of ["", "KT-26-1", "6653a1b2c3d4e5f6a7b8c9d0", "KT-2026-000001; drop", "<script>", "KT-2026-0000x1"]) {
      expect(normalizeCertificateId(bad)).toBeNull();
    }
  });

  it("uses the issue year in India Standard Time", () => {
    expect(issueYear(new Date("2026-12-31T18:29:00Z"))).toBe(2026); // 23:59 IST
    expect(issueYear(new Date("2026-12-31T18:31:00Z"))).toBe(2027); // 00:01 IST
  });
});

describe("printable text", () => {
  it("accepts English and Western European names, refuses scripts the template cannot print", () => {
    expect(isPrintableOnCertificate("Siddharth O'Brien-Pángul")).toBe(true);
    expect(isPrintableOnCertificate("José Müller")).toBe(true);
    expect(isPrintableOnCertificate("सिद्धार्थ")).toBe(false);
    expect(isPrintableOnCertificate("Ā")).toBe(false);
  });
});

describe("admin input", () => {
  it("requires explicit confirmation and never accepts eligibility, issuer or status from the client", () => {
    const id = "a".repeat(24);
    expect(issueCertificateSchema.safeParse({ enrollmentId: id, confirm: true }).success).toBe(true);
    expect(issueCertificateSchema.safeParse({ enrollmentId: id, confirm: false }).success).toBe(false);
    for (const extra of [{ eligible: true }, { issuedBy: id }, { status: "issued" }, { studentName: "X" }]) {
      expect(issueCertificateSchema.safeParse({ enrollmentId: id, confirm: true, ...extra }).success).toBe(false);
    }
    expect(revokeCertificateSchema.safeParse({ reason: "too short", confirm: true }).success).toBe(false);
    expect(revokeCertificateSchema.safeParse({ reason: "Plagiarised final project confirmed.", confirm: true }).success).toBe(true);
  });
});

describe("PDF template", () => {
  const base = {
    certificateId: "KT-2026-000001",
    studentName: "Siddharth Pangul",
    programTitle: "Web Development Basics",
    completionDate: new Date("2026-10-01T06:00:00Z"),
    issuedAt: new Date("2026-10-02T06:00:00Z"),
    verificationUrl: `https://krushitech.example/verify/${"A".repeat(43)}`,
    templateVersion: 1,
    status: "issued" as const,
  };

  it("is a one-page A4 landscape PDF with metadata and deterministic output", async () => {
    const bytes = await renderCertificatePdf(base);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(842);
    expect(Math.round(height)).toBe(595);
    expect(doc.getTitle()).toContain("KT-2026-000001");
    expect(doc.getProducer()).toContain("template v1");
    expect(doc.getModificationDate()?.toISOString()).toBe(base.issuedAt.toISOString());
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(Buffer.from(await renderCertificatePdf(base)).equals(Buffer.from(bytes))).toBe(true);
  });

  it("fits very long names and titles, and does not throw on unexpected characters", async () => {
    const long = await renderCertificatePdf({
      ...base,
      studentName: "Maximiliana Alexandrina Wolfeschlegelsteinhausenbergerdorff Venkataraghavan Subrahmanyam",
      programTitle: "A Very Long Program Title About Full-Stack Web Development With Accessible Design, Testing, Deployment and Monitoring",
    });
    expect((await PDFDocument.load(long)).getPageCount()).toBe(1);
    await expect(renderCertificatePdf({ ...base, studentName: "सिद्धार्थ" })).resolves.toBeInstanceOf(Uint8Array);
  });

  it("encodes the verification URL in a standard QR code (error correction M)", () => {
    const qr = QRCode.create(base.verificationUrl, { errorCorrectionLevel: "M" });
    expect(qr.modules.size).toBeGreaterThanOrEqual(21);
    expect(qr.segments.map((segment) => Buffer.from(segment.data as Uint8Array).toString("utf8")).join("")).toContain("/verify/");
  });
});

describe("issuance configuration", () => {
  const key = randomBytes(32).toString("base64");
  async function config(env: Record<string, string | undefined>) {
    await freshModules(env);
    return (await import("@/lib/certificates/config")).getCertificateConfig();
  }

  it("needs the token key", async () => {
    expect(await config({ CERTIFICATE_TOKEN_KEY: undefined, NODE_ENV: "development" })).toMatchObject({ ready: false });
    expect(await config({ CERTIFICATE_TOKEN_KEY: key, NODE_ENV: "development" })).toMatchObject({ ready: true });
  });

  it("never prints a development or plain-http host on production certificates", async () => {
    expect(await config({ CERTIFICATE_TOKEN_KEY: key, NODE_ENV: "production", SITE_URL: undefined })).toMatchObject({ ready: false });
    expect(await config({ CERTIFICATE_TOKEN_KEY: key, NODE_ENV: "production", SITE_URL: "http://krushitech.example" })).toMatchObject({ ready: false });
    const ready = await config({ CERTIFICATE_TOKEN_KEY: key, NODE_ENV: "production", SITE_URL: "https://krushitech.example" });
    expect(ready).toMatchObject({ ready: true });
    const { verificationUrl } = await import("@/lib/certificates/config");
    if (ready.ready) expect(verificationUrl("A".repeat(43), ready.siteUrl)).toBe(`https://krushitech.example/verify/${"A".repeat(43)}`);
  });

  it("rejects a malformed key", async () => {
    await freshModules({ CERTIFICATE_TOKEN_KEY: "too-short" });
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow(/CERTIFICATE_TOKEN_KEY/);
  });
});

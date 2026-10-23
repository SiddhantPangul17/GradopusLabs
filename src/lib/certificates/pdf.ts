import "server-only";
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import { brand } from "@/config/brand";
import type { CertificateStatus } from "@/lib/constants";
import { isPrintableOnCertificate } from "@/lib/certificates/printable";

/*
 * Certificate PDF, template version 1 (A4 landscape).
 *
 * Generated on demand from the immutable certificate record, so no PDF files
 * are stored anywhere. Output is deterministic for a given record and
 * template version (dates in the PDF metadata are the issue date).
 *
 * Content is limited to facts held in the record: no signatures, seals,
 * logos of other organisations, accreditation claims or invented people. A
 * signatory is printed only when brand.certificate.signatory is configured.
 * Fonts are the PDF standard fonts (built into every PDF reader, no licence
 * needed). The QR code is drawn as vector squares for sharp printing.
 */

export type CertificatePdfInput = {
  certificateId: string;
  studentName: string;
  programTitle: string;
  completionDate: Date;
  issuedAt: Date;
  verificationUrl: string;
  templateVersion: number;
  status: CertificateStatus;
};

const WIDTH = 841.89; // A4 landscape, points
const HEIGHT = 595.28;
const MARGIN = 64;

function hex(color: string): RGB {
  const value = Number.parseInt(color.slice(1), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

const colors = {
  primary: hex(brand.theme.colors.primary),
  primarySoft: hex(brand.theme.colors.secondary),
  text: hex(brand.theme.colors.foreground),
  muted: hex(brand.theme.colors.muted),
  error: hex(brand.theme.colors.error),
};

/** Defensive: the service refuses unprintable names, but never let the renderer throw on one. */
function printable(text: string): string {
  return [...text].map((char) => (isPrintableOnCertificate(char) ? char : "?")).join("");
}

export function formatCertificateDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: brand.timeZone }).format(date);
}

/** Splits text into lines no wider than maxWidth (long words are broken). */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  const push = (word: string) => {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      return;
    }
    if (current) lines.push(current);
    current = "";
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      return;
    }
    let piece = "";
    for (const char of word) {
      if (font.widthOfTextAtSize(piece + char, size) > maxWidth) {
        lines.push(piece);
        piece = char;
      } else piece += char;
    }
    current = piece;
  };
  for (const word of text.split(/\s+/).filter(Boolean)) push(word);
  if (current) lines.push(current);
  return lines;
}

/** Largest size (stepping down) at which the text fits in maxLines lines. */
function fit(text: string, font: PDFFont, maxWidth: number, sizes: number[], maxLines: number): { size: number; lines: string[] } {
  for (const size of sizes) {
    const lines = wrap(text, font, size, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  return { size, lines: wrap(text, font, size, maxWidth) };
}

function centered(page: PDFPage, text: string, font: PDFFont, size: number, y: number, color: RGB): void {
  page.drawText(text, { x: (WIDTH - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
}

function drawQr(page: PDFPage, url: string, x: number, y: number, size: number): void {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const quiet = 4; // standard quiet zone, in modules
  const cell = size / (count + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  // One path of horizontal runs (in module units, SVG y-down), filled once: no hairline seams between modules.
  let path = "";
  for (let row = 0; row < count; row++) {
    let col = 0;
    while (col < count) {
      if (!qr.modules.get(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < count && qr.modules.get(row, col)) col++;
      path += `M${start + quiet} ${row + quiet}h${col - start}v1h${start - col}z`;
    }
  }
  page.drawSvgPath(path, { x, y: y + size, scale: cell, color: rgb(0, 0, 0), borderWidth: 0 });
}

export async function renderCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  // updateMetadata: false keeps our producer and dates (pdf-lib would otherwise stamp "now"), so output is reproducible.
  const doc = await PDFDocument.create({ updateMetadata: false });
  const title = `${brand.name} certificate ${input.certificateId}`;
  doc.setTitle(title);
  doc.setAuthor(brand.name);
  doc.setSubject("Certificate of completion");
  doc.setCreator(`${brand.name} platform`);
  doc.setProducer(`${brand.name} certificate template v${input.templateVersion}`);
  doc.setCreationDate(input.issuedAt);
  doc.setModificationDate(input.issuedAt);

  const page = doc.addPage([WIDTH, HEIGHT]);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);

  // Frame
  page.drawRectangle({ x: 18, y: 18, width: WIDTH - 36, height: HEIGHT - 36, borderColor: colors.primary, borderWidth: 3 });
  page.drawRectangle({ x: 28, y: 28, width: WIDTH - 56, height: HEIGHT - 56, borderColor: colors.primarySoft, borderWidth: 1.5 });

  // Header
  let y = HEIGHT - 82;
  centered(page, printable(brand.name), sansBold, 24, y, colors.primary);
  y -= 18;
  centered(page, printable(brand.description), sans, 11, y, colors.muted);
  y -= 50;
  centered(page, "CERTIFICATE OF COMPLETION", sansBold, 26, y, colors.text);
  y -= 34;
  centered(page, "This is to certify that", sans, 13, y, colors.muted);

  // Student name (snapshot)
  const name = fit(printable(input.studentName), serifBold, WIDTH - MARGIN * 2 - 80, [38, 34, 30, 26, 22, 20], 2);
  y -= name.size + 12;
  for (const line of name.lines) {
    centered(page, line, serifBold, name.size, y, colors.text);
    y -= name.size * 1.1;
  }
  page.drawLine({ start: { x: WIDTH / 2 - 190, y: y + name.size * 0.6 }, end: { x: WIDTH / 2 + 190, y: y + name.size * 0.6 }, thickness: 0.75, color: colors.muted });
  y -= 14;
  centered(page, `has completed all requirements of the ${printable(brand.name)} online training program`, sans, 13, y, colors.muted);

  // Program title (snapshot)
  const program = fit(printable(input.programTitle), sansBold, WIDTH - MARGIN * 2 - 80, [22, 20, 18, 16, 14], 3);
  y -= program.size + 14;
  for (const line of program.lines) {
    centered(page, line, sansBold, program.size, y, colors.primary);
    y -= program.size * 1.2;
  }

  // Details (bottom left)
  const details: [string, string][] = [
    ["Completion date", formatCertificateDate(input.completionDate)],
    ["Issue date", formatCertificateDate(input.issuedAt)],
    ["Certificate ID", input.certificateId],
  ];
  let detailY = 150;
  for (const [label, value] of details) {
    page.drawText(label.toUpperCase(), { x: MARGIN, y: detailY, size: 8, font: sansBold, color: colors.muted });
    page.drawText(value, { x: MARGIN, y: detailY - 15, size: 12, font: label === "Certificate ID" ? sansBold : sans, color: colors.text });
    detailY -= 36;
  }

  // Signatory (only when a real, authorised person is configured)
  const signatory = brand.certificate.signatory;
  if (signatory) {
    page.drawLine({ start: { x: WIDTH / 2 - 100, y: 104 }, end: { x: WIDTH / 2 + 100, y: 104 }, thickness: 0.75, color: colors.muted });
    centered(page, printable(signatory.name), sansBold, 11, 90, colors.text);
    centered(page, printable(signatory.role), sans, 9, 77, colors.muted);
  }

  // QR code and verification instructions (bottom right). 112pt ≈ 39.5mm.
  const qrSize = 112;
  const qrX = WIDTH - MARGIN - qrSize;
  const qrY = 82;
  drawQr(page, input.verificationUrl, qrX, qrY, qrSize);
  const verifyHost = new URL(input.verificationUrl).host;
  const caption = "Scan to verify";
  page.drawText(caption, { x: qrX + (qrSize - sansBold.widthOfTextAtSize(caption, 9)) / 2, y: qrY - 12, size: 9, font: sansBold, color: colors.text });
  const instruction = `or visit ${verifyHost}/verify and enter the certificate ID`;
  page.drawText(instruction, { x: WIDTH - MARGIN - sans.widthOfTextAtSize(instruction, 8), y: qrY - 24, size: 8, font: sans, color: colors.muted });

  // Footer: what the certificate is and is not.
  const footer = `Confirms completion of a ${brand.name} online training program. It is not a degree, diploma or accredited qualification. Template v${input.templateVersion}.`;
  centered(page, printable(footer), sans, 7.5, 38, colors.muted);

  // Watermark for records that are no longer valid (admin copies only).
  if (input.status !== "issued") {
    const mark = input.status === "revoked" ? "REVOKED - NOT VALID" : "SUPERSEDED - NOT VALID";
    const size = 64;
    page.drawText(mark, {
      x: WIDTH / 2 - (sansBold.widthOfTextAtSize(mark, size) / 2) * Math.cos(Math.PI / 9),
      y: HEIGHT / 2 - 140,
      size,
      font: sansBold,
      color: colors.error,
      opacity: 0.25,
      rotate: degrees(20),
    });
  }

  return doc.save();
}

import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  degrees,
  LineCapStyle,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import QRCode from "qrcode";
import { brand } from "@/config/brand";
import type { CertificateStatus } from "@/lib/constants";
import { isPrintableOnCertificate } from "@/lib/certificates/printable";

/*
 * Certificate PDF (A4 landscape): ivory page, gold frame, serif headings.
 *
 * Generated on demand from the immutable certificate record, so no PDF files
 * are stored anywhere. Output is deterministic for a given record (dates in
 * the PDF metadata are the issue date). Every certificate, whatever template
 * version it was issued under, renders with this design; the record's version
 * is kept in the PDF metadata.
 *
 * Content is limited to facts held in the record plus the brand's own marks
 * (logo, seal): no signatures, logos of other organisations, accreditation
 * claims or invented people. A signatory is printed only when
 * brand.certificate.signatory is configured. The "Verified Credential" badge
 * and seal are printed only on valid (issued) certificates.
 *
 * Fonts are embedded: Cormorant Garamond (headings, name) and
 * Inter (text), both SIL Open Font License (see ./fonts). The logo, seal and
 * QR code are vector shapes for sharp printing.
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
const CX = WIDTH / 2;
const SIDE = 52; // left/right content margin

/** Layout is written in top-down coordinates; PDF y runs bottom-up. */
const top = (y: number) => HEIGHT - y;

function hex(color: string): RGB {
  const value = Number.parseInt(color.slice(1), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

const colors = {
  primary: hex(brand.theme.colors.primary),
  accent: hex(brand.theme.colors.accent),
  text: hex(brand.theme.colors.foreground),
  muted: hex(brand.theme.colors.muted),
  error: hex(brand.theme.colors.error),
  paper: hex("#fbf8f1"),
  gold: hex("#b8954a"),
  goldText: hex("#9a7a32"),
  seal: hex("#166534"),
  sealDark: hex("#0f4d27"),
  sealLight: hex("#1f8a4c"),
  badgeFill: hex("#dcfce7"),
  badgeBorder: hex("#86efac"),
  white: rgb(1, 1, 1),
};

// ---------- Fonts ----------

const FONT_DIR = path.join(process.cwd(), "src", "lib", "certificates", "fonts");
const FONT_FILES = {
  serif: "CormorantGaramond-SemiBold.ttf",
  serifItalic: "CormorantGaramond-MediumItalic.ttf",
  serifBoldItalic: "CormorantGaramond-BoldItalic.ttf",
  sans: "Inter-Regular.ttf",
  sansSemiBold: "Inter-SemiBold.ttf",
  sansBold: "Inter-Bold.ttf",
} as const;
type FontName = keyof typeof FONT_FILES;

// Read once per server instance. Fonts are embedded whole: the files are already trimmed to
// the certificate character set, and pdf-lib's own subsetting drops glyphs from them.
let fontBytes: Promise<Record<FontName, Uint8Array>> | undefined;
function loadFontBytes(): Promise<Record<FontName, Uint8Array>> {
  fontBytes ??= Promise.all(
    (Object.keys(FONT_FILES) as FontName[]).map(async (name) => [name, new Uint8Array(await readFile(path.join(FONT_DIR, FONT_FILES[name])))] as const),
  )
    .then((entries) => Object.fromEntries(entries) as Record<FontName, Uint8Array>)
    .catch((error) => {
      fontBytes = undefined; // retry on the next request
      throw error;
    });
  return fontBytes;
}

/**
 * Defensive: the service refuses names outside the supported character set,
 * but never let the renderer throw on one. Characters the font lacks become "?".
 */
function printable(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  return [...text].map((char) => (isPrintableOnCertificate(char) && supported.has(char.codePointAt(0)!) ? char : "?")).join("");
}

export function formatCertificateDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: brand.timeZone }).format(date);
}

// ---------- Text helpers ----------

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

type TextStyle = { font: PDFFont; size: number; color: RGB; spacing?: number };

function textWidth(text: string, { font, size, spacing = 0 }: TextStyle): number {
  return font.widthOfTextAtSize(text, size) + spacing * Math.max(text.length - 1, 0);
}

/** Draws text with optional letter spacing; `align` positions it relative to x. */
function text(page: PDFPage, value: string, x: number, y: number, style: TextStyle, align: "left" | "center" | "right" = "left"): void {
  const width = textWidth(value, style);
  const startX = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  const spacing = style.spacing ?? 0;
  if (spacing) page.pushOperators(pushGraphicsState(), setCharacterSpacing(spacing));
  page.drawText(value, { x: startX, y, size: style.size, font: style.font, color: style.color });
  if (spacing) page.pushOperators(popGraphicsState());
}

// ---------- Shapes ----------

/** SVG path of a rounded rectangle at the origin (SVG y-down units). */
function roundedRectPath(width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  return (
    `M${r} 0H${width - r}A${r} ${r} 0 0 1 ${width} ${r}V${height - r}A${r} ${r} 0 0 1 ${width - r} ${height}` +
    `H${r}A${r} ${r} 0 0 1 0 ${height - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`
  );
}

/** The brand logo (public/images/logo.svg, a 64-unit square) with its top-left corner at (x, yTop). */
function drawLogo(page: PDFPage, x: number, yTop: number, size: number, opacity = 1, mark: RGB = colors.white): void {
  const scale = size / 64;
  page.drawSvgPath(roundedRectPath(64, 64, 14), { x, y: top(yTop), scale, color: colors.primary, opacity, borderWidth: 0 });
  page.drawSvgPath("M43.3 20.7A16 16 0 1 0 48 32H34", {
    x,
    y: top(yTop),
    scale,
    borderColor: mark,
    borderWidth: 6,
    borderLineCap: LineCapStyle.Round,
    borderOpacity: opacity === 1 ? 1 : 0.85,
  });
  // The amber spark only on the real logo: on the faint watermark it reads as a smudge.
  if (opacity === 1) page.drawCircle({ x: x + 49 * scale, y: top(yTop + 15 * scale), size: 3.5 * scale, color: colors.accent });
}

/** A small check mark centred on (cx, cy) in PDF coordinates. */
function drawCheck(page: PDFPage, cx: number, cy: number, size: number, color: RGB, width: number): void {
  const s = size / 2;
  page.drawSvgPath(`M${-s} 0L${-s * 0.3} ${s * 0.7}L${s} ${-s * 0.6}`, {
    x: cx,
    y: cy,
    borderColor: color,
    borderWidth: width,
    borderLineCap: LineCapStyle.Round,
  });
}

/** Gold page frame: outer brand line, micro-text bands, inner gold rule and corner brackets. */
function drawFrame(page: PDFPage, micro: TextStyle): void {
  page.drawRectangle({ x: 0, y: 0, width: WIDTH, height: HEIGHT, color: colors.paper });
  page.drawRectangle({ x: 6, y: 6, width: WIDTH - 12, height: HEIGHT - 12, borderColor: colors.primary, borderWidth: 1 });

  const phrase = `${brand.name.toUpperCase()}  ·  VERIFIED CERTIFICATE  ·  `;
  const phraseWidth = textWidth(phrase, micro) + (micro.spacing ?? 0);
  const repeats = Math.floor((WIDTH - 60) / phraseWidth);
  const band = phrase.repeat(repeats).trimEnd().replace(/·$/, "").trimEnd();
  text(page, band, CX, top(16.5), micro, "center");
  text(page, band, CX, top(HEIGHT - 12.5), micro, "center");

  const inset = 22;
  page.drawRectangle({ x: inset, y: inset, width: WIDTH - inset * 2, height: HEIGHT - inset * 2, borderColor: colors.gold, borderWidth: 0.8 });

  const c = 28; // bracket corner inset
  const arm = 26;
  for (const [x, y, dx, dy] of [
    [c, c, 1, 1],
    [WIDTH - c, c, -1, 1],
    [c, HEIGHT - c, 1, -1],
    [WIDTH - c, HEIGHT - c, -1, -1],
  ] as const) {
    page.drawLine({ start: { x, y }, end: { x: x + arm * dx, y }, thickness: 1.6, color: colors.gold });
    page.drawLine({ start: { x, y }, end: { x, y: y + arm * dy }, thickness: 1.6, color: colors.gold });
  }
}

/** Round green seal with a scalloped edge, ring text and a check mark. (cx, cy) in PDF coordinates. */
function drawSeal(page: PDFPage, cx: number, cy: number, radius: number, ringFont: PDFFont): void {
  // Scalloped edge: a 48-point starburst.
  const points = 48;
  let edge = "";
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI * i) / points;
    const r = i % 2 === 0 ? radius : radius - 3;
    edge += `${i === 0 ? "M" : "L"}${(r * Math.cos(angle)).toFixed(2)} ${(r * Math.sin(angle)).toFixed(2)}`;
  }
  page.drawSvgPath(`${edge}Z`, { x: cx, y: cy, color: colors.seal, borderWidth: 0 });
  page.drawCircle({ x: cx, y: cy, size: radius - 5.5, borderColor: colors.white, borderWidth: 0.6, borderOpacity: 0.7 });
  page.drawCircle({ x: cx, y: cy, size: radius - 20, color: colors.sealDark, borderColor: colors.white, borderWidth: 1.4 });
  drawCheck(page, cx, cy, (radius - 20) * 0.95, colors.white, 3.2);

  // Ring text, clockwise from the left, letters upright and facing outwards.
  const ring = `VERIFIED  ·  ${brand.name.toUpperCase()}  ·  CERTIFIED  ·  `;
  const size = 6.4;
  const textRadius = radius - 14.5;
  const widths = [...ring].map((char) => ringFont.widthOfTextAtSize(char, size));
  const gap = (2 * Math.PI * textRadius - widths.reduce((a, b) => a + b, 0)) / ring.length;
  let angle = Math.PI * 0.95;
  [...ring].forEach((char, i) => {
    const half = widths[i] / 2 / textRadius;
    const mid = angle - half;
    // Start the glyph half its width before the midpoint, along the tangent.
    const x = cx + textRadius * Math.cos(mid) - (widths[i] / 2) * Math.sin(mid);
    const y = cy + textRadius * Math.sin(mid) + (widths[i] / 2) * Math.cos(mid);
    if (char.trim()) {
      page.drawText(char, { x, y, size, font: ringFont, color: colors.white, rotate: degrees((mid * 180) / Math.PI - 90) });
    }
    angle -= (widths[i] + gap) / textRadius;
  });
}

/** QR code as vector squares (one path of horizontal runs, so no hairline seams). (x, y) is the bottom-left corner. */
function drawQr(page: PDFPage, url: string, x: number, y: number, size: number): void {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const quiet = 2; // modules; the white box adds the rest of the margin
  const cell = size / (count + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: colors.white, borderColor: hex("#d6d3cb"), borderWidth: 0.6 });
  let pathData = "";
  for (let row = 0; row < count; row++) {
    let col = 0;
    while (col < count) {
      if (!qr.modules.get(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < count && qr.modules.get(row, col)) col++;
      pathData += `M${start + quiet} ${row + quiet}h${col - start}v1h${start - col}z`;
    }
  }
  page.drawSvgPath(pathData, { x, y: y + size, scale: cell, color: rgb(0, 0, 0), borderWidth: 0 });
}

// ---------- Template ----------

export async function renderCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  // updateMetadata: false keeps our producer and dates (pdf-lib would otherwise stamp "now"), so output is reproducible.
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  doc.setTitle(`${brand.name} certificate ${input.certificateId}`);
  doc.setAuthor(brand.name);
  doc.setSubject("Certificate of completion");
  doc.setCreator(`${brand.name} platform`);
  doc.setProducer(`${brand.name} certificate template v${input.templateVersion}`);
  doc.setCreationDate(input.issuedAt);
  doc.setModificationDate(input.issuedAt);

  const bytes = await loadFontBytes();
  // A fixed name per font: pdf-lib otherwise adds a random suffix, and output must be reproducible.
  const embedded = await Promise.all(
    (Object.keys(FONT_FILES) as FontName[]).map(
      async (name) => [name, await doc.embedFont(bytes[name], { customName: FONT_FILES[name].replace(/\.ttf$/, "") })] as const,
    ),
  );
  const fonts = Object.fromEntries(embedded) as Record<FontName, PDFFont>;

  const page = doc.addPage([WIDTH, HEIGHT]);
  const valid = input.status === "issued";

  drawFrame(page, { font: fonts.sansSemiBold, size: 4.6, color: colors.goldText, spacing: 1.1 });

  // Watermark logo behind the text.
  const markSize = 300;
  drawLogo(page, CX - markSize / 2, 128, markSize, 0.045, colors.paper);

  // Header, left: logo, name and tagline.
  drawLogo(page, SIDE, 40, 34);
  text(page, printable(brand.name, fonts.sansBold), SIDE + 44, top(58.5), { font: fonts.sansBold, size: 15.5, color: colors.text });
  text(page, printable(brand.description.toUpperCase(), fonts.sansSemiBold), SIDE + 44.5, top(71.5), {
    font: fonts.sansSemiBold,
    size: 5.8,
    color: colors.muted,
    spacing: 1.1,
  });

  // Header, right: certificate ID and the verified badge.
  const right = WIDTH - SIDE;
  text(page, "CERTIFICATE ID", right, top(47), { font: fonts.sansSemiBold, size: 5.8, color: colors.muted, spacing: 1.2 }, "right");
  text(page, input.certificateId, right, top(63), { font: fonts.sansBold, size: 12.5, color: colors.text, spacing: 0.7 }, "right");
  if (valid) {
    const label: TextStyle = { font: fonts.sansSemiBold, size: 7.2, color: colors.seal };
    const badgeWidth = textWidth("Verified Credential", label) + 28;
    const badgeX = right - badgeWidth;
    page.drawSvgPath(roundedRectPath(badgeWidth, 16, 8), {
      x: badgeX,
      y: top(70),
      color: colors.badgeFill,
      borderColor: colors.badgeBorder,
      borderWidth: 0.7,
    });
    page.drawCircle({ x: badgeX + 10, y: top(78), size: 4.6, color: colors.sealLight });
    drawCheck(page, badgeX + 10, top(78), 4.6, colors.white, 1.1);
    text(page, "Verified Credential", badgeX + 19, top(80.6), label);
  }

  // Title
  text(page, "Certificate", CX, top(133), { font: fonts.serif, size: 48, color: colors.primary, spacing: 1.6 }, "center");
  const ofCompletion: TextStyle = { font: fonts.sansBold, size: 7.4, color: colors.goldText, spacing: 3 };
  const ofWidth = textWidth("OF COMPLETION", ofCompletion);
  text(page, "OF COMPLETION", CX, top(157), ofCompletion, "center");
  for (const dir of [-1, 1]) {
    const inner = CX + dir * (ofWidth / 2 + 12);
    page.drawLine({ start: { x: inner, y: top(154.5) }, end: { x: inner + dir * 74, y: top(154.5) }, thickness: 0.8, color: colors.gold });
  }

  text(page, "This is to certify that", CX, top(193), { font: fonts.serifItalic, size: 15, color: colors.muted }, "center");

  // Student name (snapshot)
  const nameText = printable(input.studentName, fonts.serifBoldItalic);
  const name = fit(nameText, fonts.serifBoldItalic, 540, [48, 44, 40, 36, 32, 28, 24], 2);
  let y = 193 + 10 + name.size * 0.8;
  name.lines.forEach((line, index) => {
    if (index > 0) y += name.size * 1.02;
    text(page, line, CX, top(y), { font: fonts.serifBoldItalic, size: name.size, color: colors.text }, "center");
  });

  // Rule with a diamond under the name.
  y += 14;
  page.drawLine({ start: { x: CX - 152, y: top(y) }, end: { x: CX + 152, y: top(y) }, thickness: 0.8, color: colors.gold });
  page.drawSvgPath("M0 -4L4 0L0 4L-4 0Z", { x: CX, y: top(y), color: colors.gold, borderWidth: 0 });

  y += 22;
  const requirement = `has successfully completed all requirements of the ${brand.name} online training program in`;
  text(page, printable(requirement, fonts.sans), CX, top(y), { font: fonts.sans, size: 9.6, color: colors.muted }, "center");

  // Program title (snapshot)
  const programText = printable(input.programTitle, fonts.serif);
  const program = fit(programText, fonts.serif, 560, [27, 25, 23, 21, 19, 17], 2);
  y += 10 + program.size * 0.85;
  program.lines.forEach((line, index) => {
    if (index > 0) y += program.size * 1.12;
    text(page, line, CX, top(y), { font: fonts.serif, size: program.size, color: colors.primary, spacing: 0.4 }, "center");
  });

  // What the certificate attests. Programs need not have a final project, so it is not promised here.
  const achievement =
    "demonstrating practical skills by completing hands-on project tasks, with their work reviewed against the program's published completion criteria.";
  y += 12;
  for (const line of wrap(achievement, fonts.sans, 9.6, 470)) {
    y += 14;
    text(page, line, CX, top(y), { font: fonts.sans, size: 9.6, color: colors.muted }, "center");
  }

  // Dates (bottom left)
  const dates: [string, Date][] = [
    ["COMPLETION DATE", input.completionDate],
    ["ISSUE DATE", input.issuedAt],
  ];
  dates.forEach(([label, date], index) => {
    const x = SIDE + index * 116;
    text(page, label, x, top(470), { font: fonts.sansBold, size: 6, color: colors.muted, spacing: 1.2 });
    page.drawLine({ start: { x, y: top(475.5) }, end: { x: x + 88, y: top(475.5) }, thickness: 0.6, color: colors.gold });
    text(page, formatCertificateDate(date), x, top(492), { font: fonts.sansSemiBold, size: 10.5, color: colors.text });
  });

  // Signatory (only when a real, authorised person is configured)
  const signatory = brand.certificate.signatory;
  if (signatory) {
    const sx = 418;
    page.drawLine({ start: { x: sx - 80, y: top(476) }, end: { x: sx + 80, y: top(476) }, thickness: 0.6, color: colors.gold });
    text(page, printable(signatory.name, fonts.sansSemiBold), sx, top(489), { font: fonts.sansSemiBold, size: 9.5, color: colors.text }, "center");
    text(page, printable(signatory.role, fonts.sans), sx, top(500), { font: fonts.sans, size: 7.5, color: colors.muted }, "center");
  }

  // QR code (bottom right) and the seal beside it.
  const qrSize = 72;
  const qrX = right - qrSize;
  const qrTop = 424;
  drawQr(page, input.verificationUrl, qrX, top(qrTop + qrSize), qrSize);
  text(page, "SCAN TO VERIFY", qrX + qrSize / 2, top(qrTop + qrSize + 11), { font: fonts.sansBold, size: 6, color: colors.text, spacing: 1 }, "center");
  if (valid) drawSeal(page, qrX - 30 - 46, top(462), 46, fonts.sansBold);

  // Footer
  page.drawLine({ start: { x: SIDE, y: top(521) }, end: { x: right, y: top(521) }, thickness: 0.5, color: colors.gold });
  page.drawSvgPath("M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6zM9 12l2 2 4-4", {
    x: SIDE - 1,
    y: top(528),
    scale: 0.42,
    borderColor: colors.seal,
    borderWidth: 2.2,
    borderLineCap: LineCapStyle.Round,
  });
  text(page, "Udyam-registered MSME", SIDE + 12, top(536), { font: fonts.sans, size: 7.6, color: colors.text });

  const verifyHost = new URL(input.verificationUrl).host;
  const verifyStyle: TextStyle = { font: fonts.sans, size: 7.6, color: colors.text };
  const hostStyle: TextStyle = { font: fonts.sansSemiBold, size: 7.6, color: colors.primary };
  const parts: [string, TextStyle][] = [
    ["Verify this certificate at ", verifyStyle],
    [`${verifyHost}/verify`, hostStyle],
    [" with the ID above", verifyStyle],
  ];
  let vx = right - parts.reduce((sum, [part, style]) => sum + textWidth(part, style), 0);
  for (const [part, style] of parts) {
    text(page, part, vx, top(536), style);
    vx += textWidth(part, style);
  }

  const disclaimer = `Confirms completion of a ${brand.name} online training program. It is not a degree, diploma or accredited qualification.`;
  text(page, printable(disclaimer, fonts.sans), CX, top(550), { font: fonts.sans, size: 6.4, color: colors.muted }, "center");

  // Watermark for records that are no longer valid (admin copies only).
  if (!valid) {
    const mark = input.status === "revoked" ? "REVOKED - NOT VALID" : "SUPERSEDED - NOT VALID";
    const size = 64;
    page.drawText(mark, {
      x: CX - (fonts.sansBold.widthOfTextAtSize(mark, size) / 2) * Math.cos(Math.PI / 9),
      y: HEIGHT / 2 - 140,
      size,
      font: fonts.sansBold,
      color: colors.error,
      opacity: 0.25,
      rotate: degrees(20),
    });
  }

  return doc.save();
}

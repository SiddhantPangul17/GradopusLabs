import { brand } from "@/config/brand";

/*
 * Transactional email templates: responsive, table-based HTML with inline
 * styles, plus a plain-text alternative. Pure functions (no database).
 *
 * Every interpolated value is HTML-escaped; user-provided text (names,
 * feedback, titles) is never treated as HTML. Subjects are single-line.
 * Links are absolute URLs built by the server from SITE_URL.
 */

export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** One line, no control characters (prevents header injection), bounded length. */
export function safeSubject(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
}

/** Plain-text cleanup for user text placed in emails (no control characters except newlines). */
function cleanText(value: string, max = 2000): string {
  const text = value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type Block = { kind: "p"; text: string } | { kind: "facts"; items: [string, string][] } | { kind: "quote"; label: string; text: string } | { kind: "list"; items: string[] };

type Content = {
  subject: string;
  heading: string;
  greeting?: string;
  blocks: Block[];
  action?: { label: string; url: string };
  secondary?: { label: string; url: string };
  /** Why the recipient got this email. */
  reason: string;
};

const color = brand.theme.colors;

function htmlBlock(block: Block): string {
  switch (block.kind) {
    case "p":
      return `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${color.foreground};">${escapeHtml(block.text)}</p>`;
    case "list":
      return `<ul style="margin:0 0 16px;padding-left:20px;font-size:16px;line-height:24px;color:${color.foreground};">${block.items
        .map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`)
        .join("")}</ul>`;
    case "facts":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid ${color.border};border-radius:8px;background:${color.surface};">${block.items
        .map(
          ([label, value]) =>
            `<tr><td style="padding:10px 14px;font-size:13px;color:${color.muted};width:40%;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:10px 14px;font-size:15px;color:${color.foreground};font-weight:600;word-break:break-word;">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`;
    case "quote":
      return `<p style="margin:0 0 6px;font-size:13px;color:${color.muted};">${escapeHtml(block.label)}</p><div style="margin:0 0 16px;padding:12px 14px;border-left:3px solid ${color.primary};background:${color.surface};font-size:15px;line-height:22px;color:${color.foreground};white-space:pre-wrap;word-break:break-word;">${escapeHtml(block.text)}</div>`;
  }
}

function textBlock(block: Block): string {
  switch (block.kind) {
    case "p":
      return block.text;
    case "list":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "facts":
      return block.items.map(([label, value]) => `${label}: ${value}`).join("\n");
    case "quote":
      return `${block.label}:\n${block.text}`;
  }
}

function render(content: Content): RenderedEmail {
  const support = brand.contact.email;
  const footerHtml = [
    escapeHtml(content.reason),
    support ? `Questions? Contact <a href="mailto:${escapeHtml(support)}" style="color:${color.primary};">${escapeHtml(support)}</a>.` : "",
    `${escapeHtml(brand.name)} · ${escapeHtml(brand.description)}`,
  ]
    .filter(Boolean)
    .join("<br>");
  const button = content.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:8px;background:${color.primary};"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;padding:12px 22px;font-size:16px;font-weight:600;color:${color.onPrimary};text-decoration:none;border-radius:8px;">${escapeHtml(content.action.label)}</a></td></tr></table>`
    : "";
  const secondary = content.secondary
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:20px;color:${color.muted};">${escapeHtml(content.secondary.label)}: <a href="${escapeHtml(content.secondary.url)}" style="color:${color.primary};word-break:break-all;">${escapeHtml(content.secondary.url)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:${color.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${color.surface};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${color.background};border:1px solid ${color.border};border-radius:12px;">
<tr><td style="padding:20px 24px;border-bottom:3px solid ${color.primary};font-size:20px;font-weight:700;color:${color.primary};">${escapeHtml(brand.name)}</td></tr>
<tr><td style="padding:24px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:28px;color:${color.foreground};">${escapeHtml(content.heading)}</h1>
${content.greeting ? `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${color.foreground};">${escapeHtml(content.greeting)}</p>` : ""}
${content.blocks.map(htmlBlock).join("\n")}
${button}
${secondary}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${color.border};font-size:12px;line-height:18px;color:${color.muted};">${footerHtml}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    content.heading,
    content.greeting ?? "",
    ...content.blocks.map(textBlock),
    content.action ? `${content.action.label}: ${content.action.url}` : "",
    content.secondary ? `${content.secondary.label}: ${content.secondary.url}` : "",
    "--",
    content.reason,
    support ? `Questions? Contact ${support}.` : "",
    `${brand.name} · ${brand.description}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject: safeSubject(content.subject), html, text };
}

const hello = (name: string) => `Hello ${cleanText(name, 100)},`;
const accountReason = `You are receiving this email because of activity on your ${brand.name} account.`;

// ---------- Templates ----------

export function welcomeEmail(input: { name: string; loginUrl: string; programsUrl: string }): RenderedEmail {
  return render({
    subject: `Welcome to ${brand.name}`,
    heading: `Welcome to ${brand.name}`,
    greeting: hello(input.name),
    blocks: [
      { kind: "p", text: `Your ${brand.name} account has been created. ${brand.summary}` },
      { kind: "p", text: "Browse the programs, enrol in one that suits you, and learn by completing practical project tasks." },
    ],
    action: { label: "Log in", url: input.loginUrl },
    secondary: { label: "Browse programs", url: input.programsUrl },
    reason: `You are receiving this email because an account was created with this address on ${brand.name}. If this wasn't you, you can ignore this email.`,
  });
}

export function passwordResetEmail(input: { resetUrl: string; expiresInMinutes: number }): RenderedEmail {
  return render({
    subject: `Reset your ${brand.name} password`,
    heading: "Reset your password",
    blocks: [
      { kind: "p", text: "We received a request to reset the password for this account. Use the button below to choose a new password." },
      { kind: "p", text: `The link works once and expires in ${input.expiresInMinutes} minutes.` },
      { kind: "p", text: "If you didn't ask for this, you can ignore this email: your password stays the same." },
    ],
    action: { label: "Choose a new password", url: input.resetUrl },
    reason: `You are receiving this email because a password reset was requested for this address on ${brand.name}. We will never ask for your password by email.`,
  });
}

export function paymentConfirmationEmail(input: {
  name: string;
  programTitle: string;
  amount: string;
  reference: string;
  paidAt: string;
  link: string;
  linkLabel: string;
}): RenderedEmail {
  return render({
    subject: `Payment confirmed: ${input.programTitle}`,
    heading: "Payment confirmed",
    greeting: hello(input.name),
    blocks: [
      { kind: "p", text: "We have received and verified your payment with our payment provider." },
      {
        kind: "facts",
        items: [
          ["Program", cleanText(input.programTitle, 200)],
          ["Amount", input.amount],
          ["Payment reference", input.reference],
          ["Paid on", input.paidAt],
        ],
      },
      { kind: "p", text: "Keep this reference for your records. This email is a payment confirmation, not a tax invoice." },
    ],
    action: { label: input.linkLabel, url: input.link },
    reason: accountReason,
  });
}

export function enrollmentConfirmationEmail(input: { name: string; programTitle: string; link: string }): RenderedEmail {
  return render({
    subject: `You're enrolled: ${input.programTitle}`,
    heading: "Your enrolment is confirmed",
    greeting: hello(input.name),
    blocks: [
      { kind: "p", text: `You now have access to ${cleanText(input.programTitle, 200)}.` },
      {
        kind: "list",
        items: [
          "Open the program from your dashboard and start with the first module.",
          "Read each task's instructions and submit your work from the task page.",
          "Track reviews and feedback under Submissions.",
        ],
      },
    ],
    action: { label: "Start learning", url: input.link },
    reason: accountReason,
  });
}

export function submissionReviewedEmail(input: {
  name: string;
  programTitle: string;
  taskTitle: string;
  outcome: string;
  feedback: string | null;
  link: string;
}): RenderedEmail {
  return render({
    subject: `Your submission was reviewed: ${input.taskTitle}`,
    heading: "Your submission has been reviewed",
    greeting: hello(input.name),
    blocks: [
      {
        kind: "facts",
        items: [
          ["Program", cleanText(input.programTitle, 200)],
          ["Task", cleanText(input.taskTitle, 200)],
          ["Outcome", input.outcome],
        ],
      },
      ...(input.feedback ? [{ kind: "quote" as const, label: "Reviewer feedback", text: cleanText(input.feedback) }] : []),
    ],
    action: { label: "View your submission", url: input.link },
    reason: accountReason,
  });
}

export function certificateIssuedEmail(input: {
  name: string;
  programTitle: string;
  certificateId: string;
  issuedAt: string;
  link: string;
  verifyUrl: string;
}): RenderedEmail {
  return render({
    subject: `Your certificate is ready: ${input.programTitle}`,
    heading: "Your certificate has been issued",
    greeting: hello(input.name),
    blocks: [
      { kind: "p", text: `Congratulations on completing ${cleanText(input.programTitle, 200)}.` },
      {
        kind: "facts",
        items: [
          ["Certificate ID", input.certificateId],
          ["Issued on", input.issuedAt],
        ],
      },
      { kind: "p", text: "Sign in to download the PDF. Anyone can check the certificate's current status on our verification page." },
    ],
    action: { label: "View and download", url: input.link },
    secondary: { label: "Verify this certificate", url: input.verifyUrl },
    reason: accountReason,
  });
}

export function certificateRevokedEmail(input: { name: string; programTitle: string; certificateId: string; link: string }): RenderedEmail {
  return render({
    subject: `Certificate ${input.certificateId} has been revoked`,
    heading: "A certificate has been revoked",
    greeting: hello(input.name),
    blocks: [
      {
        kind: "p",
        text: `Your certificate ${input.certificateId} for ${cleanText(input.programTitle, 200)} has been revoked and is no longer valid. Verification now shows it as revoked.`,
      },
      { kind: "p", text: "If you believe this is a mistake, please contact us with the certificate ID." },
    ],
    action: { label: "View certificate record", url: input.link },
    reason: accountReason,
  });
}

export function certificateReplacedEmail(input: {
  name: string;
  programTitle: string;
  oldCertificateId: string;
  newCertificateId: string;
  link: string;
}): RenderedEmail {
  return render({
    subject: `Your corrected certificate: ${input.newCertificateId}`,
    heading: "Your certificate has been corrected",
    greeting: hello(input.name),
    blocks: [
      {
        kind: "p",
        text: `We issued a corrected certificate for ${cleanText(input.programTitle, 200)}. Please use the new certificate; the previous one is kept on record as replaced and is no longer current.`,
      },
      {
        kind: "facts",
        items: [
          ["New certificate ID", input.newCertificateId],
          ["Replaces", input.oldCertificateId],
        ],
      },
    ],
    action: { label: "View and download", url: input.link },
    reason: accountReason,
  });
}

"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { brand } from "@/config/brand";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { getClientIp } from "@/lib/auth/request";
import { contactLimits, type ContactField, type ContactFormState, type ContactValues } from "@/lib/contact-form";
import { isDatabaseConfigured } from "@/lib/db/mongodb";
import { getEmailConfig } from "@/lib/email/config";
import { createEmailProvider, EmailPermanentError, EmailTransientError } from "@/lib/email/provider";
import { contactMessageEmail } from "@/lib/email/templates";

const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(contactLimits.name, `Your name must be ${contactLimits.name} characters or fewer.`),
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .max(contactLimits.email, "Enter a shorter email address.")
    .pipe(z.email({ error: "Enter a valid email address, like name@example.com." })),
  subject: z
    .string()
    .trim()
    .min(1, "Enter a subject.")
    .max(contactLimits.subject, `The subject must be ${contactLimits.subject} characters or fewer.`),
  message: z
    .string()
    .trim()
    .min(contactLimits.messageMin, `Your message must be at least ${contactLimits.messageMin} characters.`)
    .max(contactLimits.message, `Your message must be ${contactLimits.message} characters or fewer.`),
}) satisfies z.ZodType<ContactValues>;

/** Reads a text field, ignoring files, and caps its length so oversized input is never echoed back. */
function readField(formData: FormData, name: string, max: number): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, max + 100) : "";
}

/**
 * Contact form handler.
 *
 * Valid messages are emailed to the support inbox (brand.contact.email)
 * through the configured email provider, with the sender as reply-to. The
 * content is not stored or logged by the website. The result is "sent" only
 * after the provider accepted the email; when email delivery is not
 * configured, the handler reports honestly that nothing was sent.
 */
export async function submitContactMessage(_previous: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const values: ContactValues = {
    name: readField(formData, "name", contactLimits.name),
    email: readField(formData, "email", contactLimits.email),
    subject: readField(formData, "subject", contactLimits.subject),
    message: readField(formData, "message", contactLimits.message),
  };
  const emailConfig = getEmailConfig();
  const inbox = brand.contact.email;
  const deliveryReady = emailConfig.status === "ready" && Boolean(inbox);

  // Honeypot: the hidden "website" field is left empty by people but often
  // filled by bots. Return the normal response so bots learn nothing.
  if (readField(formData, "website", 200) !== "") {
    return deliveryReady ? { status: "sent" } : { status: "not-connected", values };
  }

  const result = contactSchema.safeParse(values);
  if (!result.success) {
    const fieldErrors = z.flattenError(result.error).fieldErrors;
    const errors: Partial<Record<ContactField, string>> = {};
    for (const field of Object.keys(values) as ContactField[]) {
      const message = fieldErrors[field]?.[0];
      if (message) errors[field] = message;
    }
    return { status: "invalid", values, errors };
  }

  if (emailConfig.status !== "ready" || !inbox) return { status: "not-connected", values };

  // Limit messages per IP when the database is available. If the limiter
  // itself fails, deliver anyway: the form must keep working during an outage.
  if (isDatabaseConfigured()) {
    try {
      const limit = await consumeRateLimit(RATE_LIMITS.contactPerIp, getClientIp(await headers()));
      if (!limit.allowed) return { status: "rate-limited", values };
    } catch {
      console.error("[contact] Rate limit check failed; delivering without it.");
    }
  }

  try {
    await createEmailProvider(emailConfig).send({
      to: inbox,
      ...contactMessageEmail(result.data),
      replyTo: result.data.email,
      idempotencyKey: `contact-${randomUUID()}`,
    });
    return { status: "sent" };
  } catch (error) {
    const code = error instanceof EmailTransientError || error instanceof EmailPermanentError ? error.code : "unknown";
    console.error(`[contact] Message delivery failed (${code}).`);
    return { status: "error", values };
  }
}

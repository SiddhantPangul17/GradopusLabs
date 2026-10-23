"use server";

import { z } from "zod";
import { contactLimits, type ContactField, type ContactFormState, type ContactValues } from "@/lib/contact-form";

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
 * PLACEHOLDER: no email service or message storage is configured yet. The
 * input is validated on the server, then the handler reports honestly that
 * the message was NOT sent. It does not store, log or forward the content.
 * When a delivery service is added, send the message here and return
 * { status: "sent" } only after delivery succeeds.
 */
export async function submitContactMessage(_previous: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const values: ContactValues = {
    name: readField(formData, "name", contactLimits.name),
    email: readField(formData, "email", contactLimits.email),
    subject: readField(formData, "subject", contactLimits.subject),
    message: readField(formData, "message", contactLimits.message),
  };

  // Honeypot: the hidden "website" field is left empty by people but often
  // filled by bots. Return the normal response so bots learn nothing.
  if (readField(formData, "website", 200) !== "") {
    return { status: "not-connected", values };
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

  return { status: "not-connected", values };
}

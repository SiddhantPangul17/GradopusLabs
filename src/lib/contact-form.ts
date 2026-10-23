/*
 * Contact form limits and result types, shared by the client form and the
 * Server Action. Kept free of runtime dependencies so importing it from the
 * client does not bundle the validation library; the Zod schema lives in
 * app/(public)/contact/actions.ts and runs only on the server.
 */

export const contactLimits = { name: 100, email: 254, subject: 150, message: 5000, messageMin: 20 } as const;

export type ContactField = "name" | "email" | "subject" | "message";
export type ContactValues = Record<ContactField, string>;

export type ContactFormState =
  | { status: "idle" }
  | { status: "invalid"; values: ContactValues; errors: Partial<Record<ContactField, string>> }
  /** Input was valid, but no delivery backend exists, so nothing was sent or stored. */
  | { status: "not-connected"; values: ContactValues }
  | { status: "sent" }
  | { status: "error"; values: ContactValues };

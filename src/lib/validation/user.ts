import { z } from "zod";
import { AUTH_LIMITS, AUTH_MESSAGES } from "@/lib/validation/auth-rules";

/*
 * Server-side (authoritative) validation for authentication input. Rules and
 * messages come from ./auth-rules.ts, which the client forms also use.
 *
 * Every schema is `.strict()`: unknown fields are rejected, so a request can
 * never set `role`, `accountStatus`, `emailVerified`, `passwordHash`,
 * `sessionVersion`, payment or enrolment data.
 */

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, AUTH_MESSAGES.emailRequired)
  .max(AUTH_LIMITS.emailMax, AUTH_MESSAGES.emailInvalid)
  .pipe(z.email({ error: AUTH_MESSAGES.emailInvalid }));

const newPasswordSchema = z
  .string()
  .min(1, AUTH_MESSAGES.passwordRequired)
  .min(AUTH_LIMITS.passwordMin, AUTH_MESSAGES.passwordTooShort)
  .max(AUTH_LIMITS.passwordMax, AUTH_MESSAGES.passwordTooLong);

/** Public student sign-up. New accounts are always active students (set by the server). */
export const registrationInputSchema = z
  .object({
    name: z.string().trim().min(1, AUTH_MESSAGES.nameRequired).max(AUTH_LIMITS.nameMax, AUTH_MESSAGES.nameTooLong),
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { error: AUTH_MESSAGES.termsRequired }),
  })
  .strict()
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: AUTH_MESSAGES.passwordsDontMatch,
  });

export type RegistrationInput = z.infer<typeof registrationInputSchema>;

export const loginInputSchema = z
  .object({
    email: emailSchema,
    // Length-capped so oversized input is never hashed; strength is not re-checked at login.
    password: z.string().min(1, AUTH_MESSAGES.passwordRequired).max(AUTH_LIMITS.passwordMax * 4),
  })
  .strict();

export const forgotPasswordInputSchema = z.object({ email: emailSchema }).strict();

export const resetPasswordInputSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This reset link is invalid."),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .strict()
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: AUTH_MESSAGES.passwordsDontMatch,
  });

/** Profile fields a student may change. Email, role and status are not editable here. */
export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1, AUTH_MESSAGES.nameRequired).max(AUTH_LIMITS.nameMax, AUTH_MESSAGES.nameTooLong),
  })
  .strict();

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(AUTH_LIMITS.passwordMax * 4),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .strict()
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: AUTH_MESSAGES.passwordsDontMatch,
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password that is different from your current one.",
  });

/** First error message per field, for form display. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}

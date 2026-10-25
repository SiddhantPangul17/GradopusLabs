/*
 * Authentication field rules shared by the client forms (instant feedback)
 * and the server Zod schemas in ./user.ts (the authoritative check). This
 * module has no dependencies so it can be bundled for the browser cheaply.
 */

export const AUTH_LIMITS = {
  nameMax: 100,
  emailMax: 254,
  passwordMin: 6,
  passwordMax: 128,
} as const;

export const AUTH_MESSAGES = {
  nameRequired: "Enter your full name.",
  nameTooLong: `Your name must be ${AUTH_LIMITS.nameMax} characters or fewer.`,
  emailRequired: "Enter your email address.",
  emailInvalid: "Enter a valid email address, like name@example.com.",
  passwordRequired: "Enter your password.",
  passwordTooShort: `Use at least ${AUTH_LIMITS.passwordMin} characters.`,
  passwordTooLong: `Use ${AUTH_LIMITS.passwordMax} characters or fewer.`,
  passwordsDontMatch: "The passwords do not match.",
  termsRequired: "You must accept the Terms and Conditions and Privacy Policy to create an account.",
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function checkEmail(email: string): string | undefined {
  const value = normalizeEmail(email);
  if (!value) return AUTH_MESSAGES.emailRequired;
  if (value.length > AUTH_LIMITS.emailMax || !EMAIL_PATTERN.test(value)) return AUTH_MESSAGES.emailInvalid;
  return undefined;
}

export function checkNewPassword(password: string): string | undefined {
  if (!password) return AUTH_MESSAGES.passwordRequired;
  if (password.length < AUTH_LIMITS.passwordMin) return AUTH_MESSAGES.passwordTooShort;
  if (password.length > AUTH_LIMITS.passwordMax) return AUTH_MESSAGES.passwordTooLong;
  return undefined;
}

export type RegistrationFields = "name" | "email" | "password" | "confirmPassword" | "acceptTerms";

export function checkRegistration(values: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}): FieldErrors<RegistrationFields> {
  const errors: FieldErrors<RegistrationFields> = {};
  const name = values.name.trim();
  if (!name) errors.name = AUTH_MESSAGES.nameRequired;
  else if (name.length > AUTH_LIMITS.nameMax) errors.name = AUTH_MESSAGES.nameTooLong;
  const emailError = checkEmail(values.email);
  if (emailError) errors.email = emailError;
  const passwordError = checkNewPassword(values.password);
  if (passwordError) errors.password = passwordError;
  else if (values.password !== values.confirmPassword) errors.confirmPassword = AUTH_MESSAGES.passwordsDontMatch;
  if (!values.acceptTerms) errors.acceptTerms = AUTH_MESSAGES.termsRequired;
  return errors;
}

export function checkLogin(values: { email: string; password: string }): FieldErrors<"email" | "password"> {
  const errors: FieldErrors<"email" | "password"> = {};
  const emailError = checkEmail(values.email);
  if (emailError) errors.email = emailError;
  if (!values.password) errors.password = AUTH_MESSAGES.passwordRequired;
  return errors;
}

export function checkPasswordReset(values: { password: string; confirmPassword: string }): FieldErrors<"password" | "confirmPassword"> {
  const errors: FieldErrors<"password" | "confirmPassword"> = {};
  const passwordError = checkNewPassword(values.password);
  if (passwordError) errors.password = passwordError;
  else if (values.password !== values.confirmPassword) errors.confirmPassword = AUTH_MESSAGES.passwordsDontMatch;
  return errors;
}

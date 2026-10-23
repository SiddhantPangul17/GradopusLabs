"use server";

import { CredentialsSignin } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import type { ForgotPasswordState, LoginState, RegisterState, ResetPasswordState } from "@/lib/auth/action-types";
import { postLoginRedirect } from "@/lib/auth/redirects";
import { getClientIp } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/env";
import { readFormText } from "@/lib/forms";
import {
  endAllSessions,
  findActiveRoleByEmail,
  registerStudent,
  requestPasswordReset,
  resetPassword,
} from "@/lib/services/auth-service";
import { fieldErrorsOf, forgotPasswordInputSchema, loginInputSchema } from "@/lib/validation/user";

/*
 * Authentication Server Actions. Each one validates its own input on the
 * server, never logs passwords or tokens, and returns only generic,
 * user-safe messages. Server Actions are POST-only and Next.js checks the
 * Origin header, which protects them against cross-site request forgery.
 */

const NOT_CONFIGURED = "Accounts are not available yet on this site. Please try again later.";
const UNEXPECTED = "Something went wrong. Please try again in a moment.";

async function clientIp(): Promise<string> {
  return getClientIp(await headers());
}

// ---------- Login ----------

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = readFormText(formData, "email", 300);
  const password = readFormText(formData, "password", 600);
  const callbackUrl = readFormText(formData, "callbackUrl", 600);

  if (!isAuthConfigured()) return { status: "error", message: NOT_CONFIGURED, email };

  const parsed = loginInputSchema.safeParse({ email, password });
  if (!parsed.success) return { status: "error", errors: fieldErrorsOf(parsed.error), email };

  try {
    // Sets the HTTP-only session cookie on success; throws CredentialsSignin on failure.
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirect: false });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      const message =
        error.code === "rate_limited"
          ? "Too many sign-in attempts. Please wait a few minutes and try again."
          : error.code === "account_inactive"
            ? "This account is not active. Please contact us if you think this is a mistake."
            : "The email address or password is incorrect.";
      return { status: "error", message, email: parsed.data.email };
    }
    console.error("[auth] sign-in failed unexpectedly");
    return { status: "error", message: UNEXPECTED, email: parsed.data.email };
  }

  // Choose the destination from the stored role, never from anything the client sent.
  const role = await findActiveRoleByEmail(parsed.data.email);
  redirect(role ? postLoginRedirect(role, callbackUrl) : "/");
}

// ---------- Registration ----------

export async function registerAction(_previous: RegisterState, formData: FormData): Promise<RegisterState> {
  // Only these fields are read; anything else in the request (e.g. "role") is ignored.
  const values = {
    name: readFormText(formData, "name", 300),
    email: readFormText(formData, "email", 300),
    acceptTerms: formData.get("acceptTerms") === "on",
  };
  const password = readFormText(formData, "password", 600);
  const confirmPassword = readFormText(formData, "confirmPassword", 600);

  if (!isAuthConfigured()) return { status: "error", message: NOT_CONFIGURED, values };

  // Honeypot: bots that fill the hidden field get the normal success redirect but no account.
  if (readFormText(formData, "website", 200) !== "") redirect("/login?registered=1");

  let result;
  try {
    result = await registerStudent({ ...values, password, confirmPassword }, { ip: await clientIp() });
  } catch {
    console.error("[auth] registration failed unexpectedly");
    return { status: "error", message: UNEXPECTED, values };
  }

  if (result.ok) redirect("/login?registered=1");
  switch (result.reason) {
    case "invalid":
      return { status: "error", errors: result.errors, values };
    case "email_taken":
      return {
        status: "error",
        errors: { email: "An account with this email address already exists. Log in or reset your password instead." },
        values,
      };
    case "rate_limited":
      return { status: "error", message: "Too many sign-up attempts from this network. Please try again later.", values };
  }
}

// ---------- Logout ----------

/**
 * Ends the session everywhere (all devices) and clears the cookie. Does not
 * redirect: the caller performs a full page load afterwards, which discards
 * any signed-in pages Next.js keeps hidden in memory for back navigation.
 */
export async function logoutAction(): Promise<void> {
  if (!isAuthConfigured()) return;
  const user = await getCurrentUser();
  // Invalidate server-side first, so even a copied cookie stops working.
  if (user) await endAllSessions(user.id);
  await signOut({ redirect: false });
}

// ---------- Password recovery ----------

export async function forgotPasswordAction(
  _previous: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = readFormText(formData, "email", 300);
  const parsed = forgotPasswordInputSchema.safeParse({ email });
  if (!parsed.success) return { status: "error", errors: fieldErrorsOf(parsed.error), email };

  const devMode = process.env.NODE_ENV === "development";
  if (!isAuthConfigured()) return { status: "submitted", deliveryAvailable: false, rateLimited: false, devMode };

  try {
    // The response is the same whether or not the email has an account.
    const result = await requestPasswordReset(parsed.data.email, { ip: await clientIp() });
    return { status: "submitted", ...result, devMode };
  } catch {
    console.error("[auth] password reset request failed unexpectedly");
    return { status: "submitted", deliveryAvailable: false, rateLimited: false, devMode };
  }
}

export async function resetPasswordAction(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  if (!isAuthConfigured()) return { status: "error", message: NOT_CONFIGURED };

  let result;
  try {
    result = await resetPassword({
      token: readFormText(formData, "token", 100),
      password: readFormText(formData, "password", 600),
      confirmPassword: readFormText(formData, "confirmPassword", 600),
    });
  } catch {
    console.error("[auth] password reset failed unexpectedly");
    return { status: "error", message: UNEXPECTED };
  }

  if (result.ok) redirect("/login?reset=1");
  if (result.reason === "invalid") return { status: "error", errors: result.errors };
  return { status: "error", message: "This reset link is invalid or has expired. Please request a new one." };
}

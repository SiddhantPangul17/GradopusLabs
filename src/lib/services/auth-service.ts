import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import type { UserRole } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { isEmailDeliveryConfigured, siteLink } from "@/lib/email/config";
import { runAfterResponse, sendPasswordResetEmail } from "@/lib/email/outbox";
import { notifyWelcome } from "@/lib/notifications/events";
import { isDuplicateKeyError } from "@/lib/errors";
import {
  hashPassword,
  passwordHashNeedsUpgrade,
  verifyAgainstDummyHash,
  verifyPassword,
} from "@/lib/auth/password";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { fieldErrorsOf, registrationInputSchema, resetPasswordInputSchema } from "@/lib/validation/user";
import { PasswordResetTokenModel } from "@/models/password-reset-token";
import { UserModel } from "@/models/user";

/*
 * Account operations used by the auth Server Actions and Auth.js. Inputs are
 * validated here (not only in the forms), passwords are never logged, and
 * results never include hashes, tokens or internal errors.
 */

// ---------- Registration ----------

export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: "invalid"; errors: Record<string, string> }
  | { ok: false; reason: "email_taken" | "rate_limited" };

export async function registerStudent(input: unknown, context: { ip: string }): Promise<RegisterResult> {
  const parsed = registrationInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", errors: fieldErrorsOf(parsed.error) };

  const limit = await consumeRateLimit(RATE_LIMITS.registerPerIp, context.ip);
  if (!limit.allowed) return { ok: false, reason: "rate_limited" };

  const { name, email, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  let created;

  await connectToDatabase();
  // Duplicate protection relies on the unique email index. init() resolves once
  // indexes are built and rejects if building them failed, so sign-up fails
  // loudly instead of silently allowing duplicates.
  await UserModel.init();
  try {
    // Role and status are fixed by the server: public sign-up only ever creates active students.
    created = await UserModel.create({
      name,
      email,
      passwordHash,
      role: "student",
      accountStatus: "active",
      emailVerified: null,
      sessionVersion: 0,
      termsAcceptedAt: new Date(),
    });
  } catch (error) {
    // The unique index is the source of truth, so concurrent sign-ups cannot create duplicates.
    if (isDuplicateKeyError(error)) return { ok: false, reason: "email_taken" };
    throw error;
  }
  // Only after the account exists (failed sign-ups queue nothing). Never blocks or undoes the sign-up.
  await notifyWelcome(created._id);
  return { ok: true };
}

// ---------- Login ----------

export type AuthenticatedUser = { id: string; role: UserRole; sessionVersion: number };

export type AuthenticateResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; reason: "invalid_credentials" | "account_inactive" };

/**
 * Checks an email and password. Unknown emails and wrong passwords return the
 * same result and take similar time. Inactive accounts are rejected only after
 * the correct password is given, so their status is not revealed to guessers.
 */
export async function authenticateWithPassword(email: string, password: string): Promise<AuthenticateResult> {
  await connectToDatabase();
  const user = await UserModel.findOne({ email: email.trim().toLowerCase() })
    .select("+passwordHash +sessionVersion role accountStatus")
    .lean();

  if (!user?.passwordHash) {
    await verifyAgainstDummyHash(password);
    return { ok: false, reason: "invalid_credentials" };
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    return { ok: false, reason: "invalid_credentials" };
  }
  if (user.accountStatus !== "active") {
    return { ok: false, reason: "account_inactive" };
  }

  const update: Record<string, unknown> = { lastLoginAt: new Date() };
  if (passwordHashNeedsUpgrade(user.passwordHash)) update.passwordHash = await hashPassword(password);
  await UserModel.updateOne({ _id: user._id }, { $set: update });

  return { ok: true, user: { id: user._id.toString(), role: user.role, sessionVersion: user.sessionVersion ?? 0 } };
}

/** The stored role for an active account, used to choose the post-login destination. */
export async function findActiveRoleByEmail(email: string): Promise<UserRole | null> {
  await connectToDatabase();
  const user = await UserModel.findOne({ email: email.trim().toLowerCase(), accountStatus: "active" })
    .select("role")
    .lean();
  return user?.role ?? null;
}

/** Session check data; includes fields never exposed to clients (sessionVersion). */
export async function findUserForSession(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectToDatabase();
  return UserModel.findById(id).select("+sessionVersion name email role accountStatus emailVerified").lean();
}

/** Ends every session for the user (all devices) by invalidating their session version. */
export async function endAllSessions(userId: string): Promise<void> {
  if (!Types.ObjectId.isValid(userId)) return;
  await connectToDatabase();
  await UserModel.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } });
}

// ---------- Password reset ----------

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type PasswordResetRequestResult = {
  /** Whether a reset email could have been sent. Identical for known and unknown emails. */
  deliveryAvailable: boolean;
  rateLimited: boolean;
};

/**
 * Starts a password reset. The result never depends on whether the email has
 * an account.
 *
 * With an email provider configured, the link is emailed AFTER the response
 * (so response timing does not reveal whether the account exists). Without
 * one, no token is created in production; in development only, the link is
 * printed to the server console so the flow can be tested.
 */
export async function requestPasswordReset(email: string, context: { ip: string }): Promise<PasswordResetRequestResult> {
  const normalized = email.trim().toLowerCase();
  const [perIp, perAccount] = await Promise.all([
    consumeRateLimit(RATE_LIMITS.passwordResetPerIp, context.ip),
    consumeRateLimit(RATE_LIMITS.passwordResetPerAccount, normalized),
  ]);
  if (!perIp.allowed || !perAccount.allowed) {
    return { deliveryAvailable: isEmailDeliveryConfigured(), rateLimited: true };
  }

  const canDeliver = isEmailDeliveryConfigured();
  const devMode = process.env.NODE_ENV === "development";
  if (!canDeliver && !devMode) return { deliveryAvailable: false, rateLimited: false };

  await connectToDatabase();
  const user = await UserModel.findOne({ email: normalized, accountStatus: "active" }).select("_id").lean();
  if (user) {
    const token = await createPasswordResetToken(user._id.toString());
    if (devMode && !canDeliver) {
      console.info(
        `[dev only] Password reset link (email delivery is not configured): /reset-password?token=${token}`,
      );
    }
    if (canDeliver) {
      const userId = user._id.toString();
      const resetUrl = siteLink(`/reset-password?token=${token}`);
      runAfterResponse(() => sendPasswordResetEmail({ userId, resetUrl, expiresInMinutes: RESET_TOKEN_TTL_MS / 60_000 }));
    }
  }
  return { deliveryAvailable: canDeliver, rateLimited: false };
}

/** Creates a single-use token, replacing any earlier unused ones. Returns the raw token. */
export async function createPasswordResetToken(userId: string): Promise<string> {
  await connectToDatabase();
  const token = randomBytes(32).toString("base64url"); // 43 characters
  await PasswordResetTokenModel.deleteMany({ userId, usedAt: null });
  await PasswordResetTokenModel.create({
    userId,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });
  return token;
}

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; reason: "invalid"; errors: Record<string, string> }
  | { ok: false; reason: "invalid_token" };

/** Sets a new password from a valid token, consumes the token and ends all sessions. */
export async function resetPassword(input: unknown): Promise<ResetPasswordResult> {
  const parsed = resetPasswordInputSchema.safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrorsOf(parsed.error);
    return errors.token ? { ok: false, reason: "invalid_token" } : { ok: false, reason: "invalid", errors };
  }

  await connectToDatabase();
  // Atomically claim the token so it can only ever be used once.
  const claimed = await PasswordResetTokenModel.findOneAndUpdate(
    { tokenHash: hashResetToken(parsed.data.token), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { returnDocument: "after", lean: true },
  );
  if (!claimed) return { ok: false, reason: "invalid_token" };

  const passwordHash = await hashPassword(parsed.data.password);
  const updated = await UserModel.updateOne(
    { _id: claimed.userId, accountStatus: "active" },
    { $set: { passwordHash }, $inc: { sessionVersion: 1 } },
  );
  if (updated.matchedCount === 0) return { ok: false, reason: "invalid_token" };

  await PasswordResetTokenModel.deleteMany({ userId: claimed.userId, usedAt: null });
  return { ok: true };
}

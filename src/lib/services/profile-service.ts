import "server-only";
import { Types } from "mongoose";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { connectToDatabase } from "@/lib/db/mongodb";
import type { Actor } from "@/lib/services/authorization";
import { fail, type ServiceResult } from "@/lib/services/result";
import { fieldErrorsOf, passwordChangeSchema, profileUpdateSchema } from "@/lib/validation/user";
import { UserModel } from "@/models/user";

/*
 * Self-service account changes. Only the user's own record is touched
 * (filtered by the verified actor id and active status). Students can change
 * their name and password; email, role, status and payment or certificate
 * data are not editable here (`.strict()` schemas reject them).
 */

export async function updateOwnProfile(actor: Actor, input: unknown): Promise<ServiceResult<{ name: string }>> {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please check your details.", fieldErrorsOf(parsed.error));

  await connectToDatabase();
  const result = await UserModel.updateOne(
    { _id: new Types.ObjectId(actor.id), accountStatus: "active" },
    { $set: { name: parsed.data.name } },
  );
  if (result.matchedCount === 0) return fail("unauthenticated", "Your session has ended. Please log in again.");
  return { ok: true, data: { name: parsed.data.name } };
}

/**
 * Changes the password after verifying the current one, then ends every
 * session (including this one) so the user signs in again with the new password.
 */
export async function changeOwnPassword(actor: Actor, input: unknown): Promise<ServiceResult<null>> {
  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Please check the form.", fieldErrorsOf(parsed.error));

  const limit = await consumeRateLimit(RATE_LIMITS.passwordChangePerAccount, actor.id);
  if (!limit.allowed) return fail("conflict", "Too many attempts. Please wait a few minutes and try again.");

  await connectToDatabase();
  const user = await UserModel.findOne({ _id: new Types.ObjectId(actor.id), accountStatus: "active" })
    .select("+passwordHash")
    .lean();
  if (!user) return fail("unauthenticated", "Your session has ended. Please log in again.");
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    return fail("invalid", "Please check the form.", { currentPassword: "Your current password is incorrect." });
  }

  await UserModel.updateOne(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(parsed.data.newPassword) }, $inc: { sessionVersion: 1 } },
  );
  return { ok: true, data: null };
}

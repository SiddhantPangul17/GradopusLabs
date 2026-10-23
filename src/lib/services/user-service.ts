import "server-only";
import type { Types } from "mongoose";
import type { AccountStatus, UserRole } from "@/lib/constants";
import { connectToDatabase } from "@/lib/db/mongodb";
import { isValidObjectIdString } from "@/lib/validation/common";
import { UserModel, type UserRecord } from "@/models/user";

/**
 * A user without credentials, suitable for the account owner or an admin.
 * Never includes passwordHash.
 */
export type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  createdAt: string;
};

type UserDocument = Omit<UserRecord, "passwordHash"> & { _id: Types.ObjectId };

export function toSafeUser(doc: UserDocument): SafeUser {
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    accountStatus: doc.accountStatus,
    emailVerified: doc.emailVerified !== null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function findUserById(id: string): Promise<SafeUser | null> {
  if (!isValidObjectIdString(id)) return null;
  await connectToDatabase();
  // passwordHash has `select: false`, so it is not loaded here.
  const doc = await UserModel.findById(id).lean<UserDocument>();
  return doc ? toSafeUser(doc) : null;
}

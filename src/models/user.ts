import "server-only";
import { model, models, Schema, type Model } from "mongoose";
import { ACCOUNT_STATUSES, USER_ROLES, type AccountStatus, type UserRole } from "@/lib/constants";

/*
 * A platform user (student or admin).
 *
 * Authentication uses Auth.js with email + password (Credentials provider and
 * JWT sessions); see src/auth.ts. `passwordHash` holds an Argon2id hash and is
 * never selected by default. Field names (name, email, emailVerified) and the
 * "users" collection stay compatible with the Auth.js MongoDB adapter in case
 * OAuth providers are added later.
 *
 * Roles and account status are assigned by trusted server code only: public
 * input schemas (src/lib/validation/user.ts) reject both fields.
 */

export type UserRecord = {
  name: string;
  /** Stored trimmed and lowercased; unique. */
  email: string;
  emailVerified: Date | null;
  /** Hash only (never plaintext). Excluded from queries unless explicitly selected. */
  passwordHash?: string;
  role: UserRole;
  /** Only "active" accounts can sign in or keep using an existing session. */
  accountStatus: AccountStatus;
  /**
   * Incremented to end every existing session for this user (logout,
   * password reset, role change). Sessions carry the value they were issued
   * with and are rejected when it no longer matches. Never selected by default.
   */
  sessionVersion: number;
  /** When the user accepted the terms and privacy policy at registration. */
  termsAcceptedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const userSchema = new Schema<UserRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address."],
      unique: true,
    },
    emailVerified: { type: Date, default: null },
    passwordHash: { type: String, select: false, maxlength: 255 },
    role: { type: String, enum: USER_ROLES, required: true, default: "student" },
    accountStatus: { type: String, enum: ACCOUNT_STATUSES, required: true, default: "active" },
    sessionVersion: { type: Number, required: true, default: 0, min: 0, select: false },
    termsAcceptedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, strict: "throw", collection: "users" },
);

// Admin user lists filter by role and status.
userSchema.index({ role: 1, accountStatus: 1 });
// Admin student list, newest first.
userSchema.index({ role: 1, createdAt: -1 });

export const UserModel: Model<UserRecord> =
  (models.User as Model<UserRecord> | undefined) ?? model<UserRecord>("User", userSchema);

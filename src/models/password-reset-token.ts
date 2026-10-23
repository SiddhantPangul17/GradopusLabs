import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";

/*
 * Single-use password reset tokens. Only a SHA-256 hash of the token is
 * stored; the raw token exists only in the link sent to the user. Expired
 * documents are removed automatically by a TTL index.
 */

export type PasswordResetTokenRecord = {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

const passwordResetTokenSchema = new Schema<PasswordResetTokenRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, match: /^[a-f0-9]{64}$/ },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strict: "throw", collection: "password_reset_tokens" },
);

// MongoDB deletes each document once its expiresAt time has passed.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetTokenModel: Model<PasswordResetTokenRecord> =
  (models.PasswordResetToken as Model<PasswordResetTokenRecord> | undefined) ??
  model<PasswordResetTokenRecord>("PasswordResetToken", passwordResetTokenSchema);

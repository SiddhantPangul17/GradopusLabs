import "server-only";
import { model, models, Schema, type Model, type Types } from "mongoose";
import { CERTIFICATE_ID_PATTERN, CERTIFICATE_STATUSES, type CertificateStatus } from "@/lib/constants";

/*
 * An issued certificate. Records are NEVER deleted or renumbered: revoked and
 * superseded certificates stay so verification can report their status.
 *
 * The student's name and program title are SNAPSHOTS taken at issuance, so
 * later profile or program edits never silently change a certificate; a
 * correction is made by issuing a replacement.
 *
 * No email, password, session or payment data is stored here.
 */

export type CertificateRecord = {
  /** Public, readable number, e.g. GOL-2026-000001. Unique, never reused. */
  certificateId: string;
  /** SHA-256 of the verification token (lookups). */
  verificationTokenHash: string;
  /** The token, AES-256-GCM encrypted (to regenerate the QR code). Never selected by default. */
  verificationTokenSealed: string;
  studentId: Types.ObjectId;
  programId: Types.ObjectId;
  enrollmentId: Types.ObjectId;
  studentNameSnapshot: string;
  programTitleSnapshot: string;
  /** When the student met the program's requirements (from their submissions/progress). */
  completionDate: Date;
  issuedAt: Date;
  issuedBy: Types.ObjectId;
  status: CertificateStatus;
  supersedesCertificateId: Types.ObjectId | null;
  supersededByCertificateId: Types.ObjectId | null;
  supersededAt: Date | null;
  /** Why a replacement was issued (stored on the replacement). Internal; never shown publicly. */
  correctionReason: string | null;
  revokedAt: Date | null;
  revokedBy: Types.ObjectId | null;
  /** Internal; never shown on public verification. */
  revocationReason: string | null;
  templateVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

const certificateSchema = new Schema<CertificateRecord>(
  {
    certificateId: { type: String, required: true, match: CERTIFICATE_ID_PATTERN, immutable: true },
    verificationTokenHash: { type: String, required: true, match: /^[0-9a-f]{64}$/, immutable: true },
    verificationTokenSealed: { type: String, required: true, select: false, maxlength: 200, immutable: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true, immutable: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true, immutable: true },
    studentNameSnapshot: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
    programTitleSnapshot: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
    completionDate: { type: Date, required: true, immutable: true },
    issuedAt: { type: Date, required: true, immutable: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    status: { type: String, enum: CERTIFICATE_STATUSES, required: true, default: "issued" },
    supersedesCertificateId: { type: Schema.Types.ObjectId, ref: "Certificate", default: null, immutable: true },
    supersededByCertificateId: { type: Schema.Types.ObjectId, ref: "Certificate", default: null },
    supersededAt: { type: Date, default: null },
    correctionReason: { type: String, default: null, maxlength: 500, immutable: true },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    revocationReason: { type: String, default: null, maxlength: 500 },
    templateVersion: { type: Number, required: true, min: 1, immutable: true },
  },
  { timestamps: true, strict: "throw" },
);

certificateSchema.index({ certificateId: 1 }, { unique: true, name: "unique_certificate_id" });
certificateSchema.index({ verificationTokenHash: 1 }, { unique: true, name: "unique_verification_token" });
// At most one VALID certificate per enrollment: concurrent or repeated issuance cannot create a second one.
certificateSchema.index(
  { enrollmentId: 1 },
  { unique: true, name: "unique_issued_per_enrollment", partialFilterExpression: { status: "issued" } },
);
certificateSchema.index({ studentId: 1, issuedAt: -1 });
certificateSchema.index({ status: 1, issuedAt: -1 });
certificateSchema.index({ programId: 1, issuedAt: -1 });
certificateSchema.index({ issuedAt: -1 });
certificateSchema.index({ revokedAt: 1 }, { partialFilterExpression: { revokedAt: { $type: "date" } } });
certificateSchema.index({ supersededAt: 1 }, { partialFilterExpression: { supersededAt: { $type: "date" } } });

export const CertificateModel: Model<CertificateRecord> =
  (models.Certificate as Model<CertificateRecord> | undefined) ?? model<CertificateRecord>("Certificate", certificateSchema);

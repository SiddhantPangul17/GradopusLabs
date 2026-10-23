"use client";

import { AdminForm } from "@/components/admin/admin-form";
import { CheckboxField, TextareaField } from "@/components/ui/form-field";
import type { FormResult } from "@/lib/form-result";

type Action = (previous: FormResult, formData: FormData) => Promise<FormResult>;

/** Issue after explicit confirmation; eligibility is re-checked on the server. */
export function IssueCertificateForm({ action, idPrefix, studentName }: { action: Action; idPrefix: string; studentName: string }) {
  return (
    <AdminForm action={action} submitLabel="Issue certificate" pendingLabel="Issuing…">
      {(errors) => (
        <CheckboxField
          id={`${idPrefix}-confirm`}
          name="confirm"
          required
          label={`Issue a certificate to ${studentName}. The name and program title are recorded as they are now and cannot be edited later.`}
          error={errors.confirm}
        />
      )}
    </AdminForm>
  );
}

export function RevokeCertificateForm({ action }: { action: Action }) {
  return (
    <AdminForm action={action} submitLabel="Revoke certificate" pendingLabel="Revoking…" submitVariant="destructive">
      {(errors) => (
        <>
          <TextareaField
            id="revoke-reason"
            name="reason"
            label="Reason (recorded internally; never shown on public verification)"
            rows={3}
            maxLength={500}
            required
            error={errors.reason}
          />
          <CheckboxField
            id="revoke-confirm"
            name="confirm"
            required
            label="I understand this cannot be undone: verification will show the certificate as revoked immediately."
            error={errors.confirm}
          />
        </>
      )}
    </AdminForm>
  );
}

export function ReplaceCertificateForm({ action }: { action: Action }) {
  return (
    <AdminForm action={action} submitLabel="Issue corrected replacement" pendingLabel="Replacing…">
      {(errors) => (
        <>
          <TextareaField
            id="replace-reason"
            name="reason"
            label="Why is a correction needed? (e.g. name spelling corrected in the student's profile)"
            rows={3}
            maxLength={500}
            required
            error={errors.reason}
          />
          <CheckboxField
            id="replace-confirm"
            name="confirm"
            required
            label="Mark this certificate as superseded and issue a new one with a new number, using the student's current name and the program's current title."
            error={errors.confirm}
          />
        </>
      )}
    </AdminForm>
  );
}

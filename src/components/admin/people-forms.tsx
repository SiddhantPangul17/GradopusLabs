"use client";

import { AdminForm } from "@/components/admin/admin-form";
import { CheckboxField, SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import type { FormResult } from "@/lib/form-result";

type Action = (previous: FormResult, formData: FormData) => Promise<FormResult>;

/** Suspend or reactivate a student account, with a recorded reason and confirmation. */
export function StudentStatusForm({ action, currentStatus, idPrefix }: { action: Action; currentStatus: string; idPrefix: string }) {
  const suspend = currentStatus === "active";
  return (
    <AdminForm action={action} submitLabel={suspend ? "Suspend account" : "Reactivate account"} pendingLabel="Saving…" submitVariant={suspend ? "destructive" : "primary"}>
      {(errors) => (
        <>
          <input type="hidden" name="status" value={suspend ? "suspended" : "active"} />
          <TextareaField id={`${idPrefix}-reason`} name="reason" label="Reason (recorded in the audit log)" rows={2} maxLength={300} required error={errors.reason} />
          <CheckboxField
            id={`${idPrefix}-confirm`}
            name="confirm"
            required
            label={suspend ? "I understand the student will be signed out and cannot log in until reactivated." : "Reactivate this account."}
            error={errors.confirm}
          />
        </>
      )}
    </AdminForm>
  );
}

/** Grants an enrolment without online payment (recorded as manual, amount paid ₹0). */
export function ManualEnrollmentForm({ action, programs }: { action: Action; programs: { slug: string; title: string }[] }) {
  return (
    <AdminForm action={action} submitLabel="Create manual enrolment" pendingLabel="Creating…" resetOnSuccess>
      {(errors) => (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField id="manual-email" name="email" type="email" label="Student email" required error={errors.email} />
            <SelectField id="manual-program" name="programSlug" label="Program (published)" required defaultValue="" error={errors.programSlug}>
              <option value="" disabled>
                Choose a program
              </option>
              {programs.map((program) => (
                <option key={program.slug} value={program.slug}>
                  {program.title}
                </option>
              ))}
            </SelectField>
          </div>
          <CheckboxField
            id="manual-confirm"
            name="confirmNoPayment"
            required
            label="I confirm this enrolment is granted without an online payment. It will be recorded as a manual enrolment, not as paid."
            error={errors.confirmNoPayment}
          />
        </>
      )}
    </AdminForm>
  );
}

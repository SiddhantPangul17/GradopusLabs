"use client";

import { AdminForm } from "@/components/admin/admin-form";
import { TextareaField, TextField } from "@/components/ui/form-field";
import type { FormResult } from "@/lib/form-result";

type Action = (previous: FormResult, formData: FormData) => Promise<FormResult>;

const DECISION_LABELS: Record<string, { label: string; hint: string }> = {
  accepted: { label: "Accept", hint: "The task counts as complete for the student." },
  changes_requested: { label: "Request changes", hint: "The student can submit a new attempt. Feedback is required." },
  rejected: { label: "Reject", hint: "The work is not accepted; the student may submit a new attempt. Feedback is required." },
  under_review: { label: "Mark as under review", hint: "Tells the student someone is looking at it." },
};

/** Decision form. The reviewer is the signed-in admin; the server checks allowed transitions. */
export function ReviewForm({ action, decisions }: { action: Action; decisions: string[] }) {
  return (
    <AdminForm action={action} submitLabel="Save review" pendingLabel="Saving…">
      {(errors) => (
        <>
          <fieldset>
            <legend className="type-label text-foreground">Decision</legend>
            <div className="mt-3 space-y-3">
              {decisions.map((decision, index) => (
                <label key={decision} className="flex cursor-pointer items-start gap-3">
                  <input type="radio" name="decision" value={decision} defaultChecked={index === 0} className="mt-1 size-4 accent-primary" />
                  <span>
                    <span className="type-label block text-foreground">{DECISION_LABELS[decision]?.label ?? decision}</span>
                    <span className="type-supporting block text-muted">{DECISION_LABELS[decision]?.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.status && <p className="type-supporting mt-2 font-medium text-error">{errors.status}</p>}
          </fieldset>
          <TextareaField id="review-feedback" name="feedback" label="Feedback to the student" hint="Plain text, shown to the student with this attempt." rows={6} maxLength={5000} error={errors.feedback} />
          <TextField id="review-score" name="score" type="number" label="Score (0–100, optional)" min={0} max={100} error={errors.score} />
        </>
      )}
    </AdminForm>
  );
}

export function FeedbackForm({ action, feedback, score }: { action: Action; feedback: string; score: number | null }) {
  return (
    <AdminForm action={action} submitLabel="Update feedback" pendingLabel="Saving…" submitVariant="outline">
      {(errors) => (
        <>
          <TextareaField id="update-feedback" name="feedback" label="Feedback to the student" rows={5} maxLength={5000} defaultValue={feedback} error={errors.feedback} />
          <TextField id="update-score" name="score" type="number" label="Score (0–100, optional)" min={0} max={100} defaultValue={score === null ? "" : String(score)} error={errors.score} />
        </>
      )}
    </AdminForm>
  );
}

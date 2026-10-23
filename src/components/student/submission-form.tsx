"use client";

import { useActionState, useState, type FormEvent } from "react";
import { FormStatus, focusFirstInvalid } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { TextareaField, TextField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { submitTaskAction } from "@/lib/student/actions";
import type { FormResult } from "@/lib/student/action-types";
import { checkProjectUrl, checkTextAnswer, SUBMISSION_LIMITS } from "@/lib/validation/submission-rules";

const initial: FormResult = { status: "idle" };

/** Submits a new attempt (text or project link). The server re-validates everything. */
export function SubmissionForm({ taskId, submissionType }: { taskId: string; submissionType: "text" | "project_url" }) {
  const [state, formAction, pending] = useActionState(submitTaskAction.bind(null, taskId), initial);
  const [clientError, setClientError] = useState<string | undefined>();
  const field = submissionType === "text" ? "textContent" : "projectUrl";
  const serverError = state.status === "error" ? state.fieldErrors?.[field] : undefined;
  const error = clientError ?? serverError;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const value = String(new FormData(event.currentTarget).get(field) ?? "");
    const found = submissionType === "text" ? checkTextAnswer(value) : checkProjectUrl(value);
    setClientError(found);
    if (found) {
      event.preventDefault();
      focusFirstInvalid(event.currentTarget, [field]);
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormStatus focusKey={state.status === "idle" ? null : state}>
        {state.status === "success" && <Notice tone="success" title="Submitted">{state.message}</Notice>}
        {state.status === "error" && !serverError && <Notice tone="error" title="Could not submit">{state.message}</Notice>}
      </FormStatus>
      <input type="hidden" name="submissionType" value={submissionType} />
      {/* Successful submissions clear the form (key changes); errors keep the input. */}
      <div key={state.status === "success" ? state.message : "form"}>
        {submissionType === "text" ? (
          <TextareaField
            id="submission-text"
            name="textContent"
            label="Your answer"
            hint={`Plain text, up to ${SUBMISSION_LIMITS.textMax.toLocaleString("en-IN")} characters.`}
            rows={10}
            required
            maxLength={SUBMISSION_LIMITS.textMax}
            error={error}
          />
        ) : (
          <TextField
            id="submission-url"
            name="projectUrl"
            type="url"
            label="Project link"
            hint="A public https:// link, for example to your GitHub repository or deployed site."
            placeholder="https://"
            autoComplete="url"
            required
            maxLength={SUBMISSION_LIMITS.urlMax}
            error={error}
          />
        )}
      </div>
      <Button type="submit" size="lg" loading={pending} loadingText="Submitting…">
        Submit for review
      </Button>
    </form>
  );
}

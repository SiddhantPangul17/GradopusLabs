"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { FormStatus } from "@/components/auth/form-status";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { IDLE, type FormResult } from "@/lib/form-result";

type AdminFormProps = {
  action: (previous: FormResult, formData: FormData) => Promise<FormResult>;
  submitLabel: string;
  pendingLabel: string;
  submitVariant?: ButtonVariant;
  /** Clear the fields after a successful save (for "add" forms). */
  resetOnSuccess?: boolean;
  /** Fields; receives the server's field-level errors. */
  children: (errors: Record<string, string>) => ReactNode;
  className?: string;
};

/**
 * Admin form wrapper. Submits through a transition instead of the form
 * `action` prop, so React does not reset the fields after a validation error
 * (long program forms keep their edits). The submit button is disabled while
 * saving, preventing double submissions.
 */
export function AdminForm({ action, submitLabel, pendingLabel, submitVariant, resetOnSuccess, children, className }: AdminFormProps) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.status === "success") formRef.current?.reset();
  }, [state, resetOnSuccess]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className={className ?? "space-y-5"}>
      <FormStatus focusKey={state.status === "idle" ? null : state}>
        {state.status === "success" && <Notice tone="success" title={state.message} />}
        {state.status === "error" && (
          <Notice tone="error" title={state.fieldErrors ? "Please correct the highlighted fields" : "Not saved"}>
            {state.fieldErrors ? (state.message !== "Please correct the highlighted fields." ? state.message : undefined) : state.message}
          </Notice>
        )}
      </FormStatus>
      {children(errors)}
      <Button type="submit" variant={submitVariant} loading={pending} loadingText={pendingLabel} success={state.status === "success"}>
        {submitLabel}
      </Button>
    </form>
  );
}

"use client";

import { useActionState, useState, type FormEvent } from "react";
import { FormStatus, focusFirstInvalid } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { changePasswordAction, updateProfileAction } from "@/lib/student/actions";
import type { FormResult, PasswordChangeResult } from "@/lib/student/action-types";
import { AUTH_LIMITS, AUTH_MESSAGES, checkNewPassword, type FieldErrors } from "@/lib/validation/auth-rules";

export function ProfileNameForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, { status: "idle" } as FormResult);
  const [clientError, setClientError] = useState<string | undefined>();
  const error = clientError ?? (state.status === "error" ? state.fieldErrors?.name : undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const value = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    const found = !value ? AUTH_MESSAGES.nameRequired : value.length > AUTH_LIMITS.nameMax ? AUTH_MESSAGES.nameTooLong : undefined;
    setClientError(found);
    if (found) {
      event.preventDefault();
      focusFirstInvalid(event.currentTarget, ["name"]);
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormStatus focusKey={state.status === "idle" ? null : state}>
        {state.status === "success" && <Notice tone="success" title="Saved">{state.message}</Notice>}
        {state.status === "error" && !state.fieldErrors && <Notice tone="error" title="Could not save">{state.message}</Notice>}
      </FormStatus>
      <TextField
        id="profile-name"
        name="name"
        label="Full name"
        hint="Shown on your dashboard and printed on certificates issued from now on (issued certificates keep the name they were issued with)."
        autoComplete="name"
        required
        maxLength={AUTH_LIMITS.nameMax}
        defaultValue={name}
        error={error}
      />
      <Button type="submit" loading={pending} loadingText="Saving…">
        Save name
      </Button>
    </form>
  );
}

/**
 * After a successful change every session has ended, so leave with a FULL page
 * load immediately (before Next.js re-renders this now signed-out page), which
 * also clears signed-in pages kept in memory for back navigation.
 */
async function changePasswordAndLeave(previous: PasswordChangeResult, formData: FormData): Promise<PasswordChangeResult> {
  const result = await changePasswordAction(previous, formData);
  if (result.status === "password_changed") window.location.replace("/login?password=changed");
  return result;
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAndLeave, { status: "idle" } as PasswordChangeResult);
  const [clientErrors, setClientErrors] = useState<FieldErrors<"currentPassword" | "newPassword" | "confirmPassword">>({});
  const serverErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const errors = Object.keys(clientErrors).length > 0 ? clientErrors : serverErrors;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const current = String(data.get("currentPassword") ?? "");
    const next = String(data.get("newPassword") ?? "");
    const confirm = String(data.get("confirmPassword") ?? "");
    const found: typeof clientErrors = {};
    if (!current) found.currentPassword = "Enter your current password.";
    const nextError = checkNewPassword(next);
    if (nextError) found.newPassword = nextError;
    else if (next !== confirm) found.confirmPassword = AUTH_MESSAGES.passwordsDontMatch;
    setClientErrors(found);
    if (Object.keys(found).length > 0) {
      event.preventDefault();
      focusFirstInvalid(event.currentTarget, Object.keys(found));
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormStatus focusKey={state.status === "error" ? state : null}>
        {state.status === "error" && !state.fieldErrors && <Notice tone="error" title="Could not change password">{state.message}</Notice>}
      </FormStatus>
      <TextField id="current-password" name="currentPassword" type="password" label="Current password" autoComplete="current-password" required error={errors.currentPassword} />
      <TextField
        id="new-password"
        name="newPassword"
        type="password"
        label="New password"
        hint={`At least ${AUTH_LIMITS.passwordMin} characters. You will be signed out everywhere and asked to log in again.`}
        autoComplete="new-password"
        required
        maxLength={AUTH_LIMITS.passwordMax}
        error={errors.newPassword}
      />
      <TextField id="confirm-new-password" name="confirmPassword" type="password" label="Confirm new password" autoComplete="new-password" required maxLength={AUTH_LIMITS.passwordMax} error={errors.confirmPassword} />
      <Button type="submit" variant="outline" loading={pending || state.status === "password_changed"} loadingText="Changing password…">
        Change password
      </Button>
    </form>
  );
}

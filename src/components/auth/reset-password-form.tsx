"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";
import { FormStatus, focusFirstInvalid } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { resetPasswordAction } from "@/lib/auth/actions";
import type { ResetPasswordState } from "@/lib/auth/action-types";
import { AUTH_LIMITS, checkPasswordReset, type FieldErrors } from "@/lib/validation/auth-rules";

const initialState: ResetPasswordState = { status: "idle" };

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);
  const [clientErrors, setClientErrors] = useState<FieldErrors<"password" | "confirmPassword">>({});
  const serverErrors = state.status === "error" ? (state.errors ?? {}) : {};
  const errors = Object.keys(clientErrors).length > 0 ? clientErrors : serverErrors;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const found = checkPasswordReset({
      password: String(data.get("password") ?? ""),
      confirmPassword: String(data.get("confirmPassword") ?? ""),
    });
    setClientErrors(found);
    if (Object.keys(found).length > 0) {
      event.preventDefault();
      focusFirstInvalid(event.currentTarget, Object.keys(found));
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormStatus focusKey={state.status === "idle" ? null : state}>
        {state.status === "error" && state.message && (
          <Notice tone="error" title="Could not reset your password">
            {state.message}{" "}
            <Link href="/forgot-password" className="font-semibold underline">
              Request a new link
            </Link>
            .
          </Notice>
        )}
      </FormStatus>
      <input type="hidden" name="token" value={token} />
      <TextField
        id="reset-password"
        name="password"
        type="password"
        label="New password"
        hint={`At least ${AUTH_LIMITS.passwordMin} characters.`}
        autoComplete="new-password"
        required
        maxLength={AUTH_LIMITS.passwordMax}
        error={errors.password}
      />
      <TextField
        id="reset-confirm-password"
        name="confirmPassword"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        maxLength={AUTH_LIMITS.passwordMax}
        error={errors.confirmPassword}
      />
      <Button type="submit" size="lg" fullWidth loading={pending} loadingText="Saving…">
        Set new password
      </Button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";
import { FormStatus, focusFirstInvalid } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { forgotPasswordAction } from "@/lib/auth/actions";
import type { ForgotPasswordState } from "@/lib/auth/action-types";
import { AUTH_LIMITS, checkEmail } from "@/lib/validation/auth-rules";

const initialState: ForgotPasswordState = { status: "idle" };

/** The outcome never reveals whether the email belongs to an account. */
function Result({ state }: { state: ForgotPasswordState }) {
  if (state.status !== "submitted") return null;
  if (state.rateLimited) {
    return (
      <Notice tone="warning" title="Too many requests">
        Please wait an hour before requesting another password reset.
      </Notice>
    );
  }
  if (!state.deliveryAvailable) {
    return (
      <div className="space-y-3">
        <Notice tone="warning" title="No reset email was sent">
          Password reset emails cannot be sent yet because email delivery has not been set up on this site. If you
          cannot access your account, please <Link href="/contact" className="font-semibold underline">contact us</Link>.
        </Notice>
        {state.devMode && (
          <Notice tone="info" title="Development mode">
            If an active account exists for that email, a reset link was printed in the server console.
          </Notice>
        )}
      </div>
    );
  }
  return (
    <Notice tone="success" title="Check your email">
      If an account exists for that address, we have sent a link to reset your password. The link expires in 30
      minutes.
    </Notice>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialState);
  const [clientError, setClientError] = useState<string | undefined>();
  const error = clientError ?? (state.status === "error" ? state.errors.email : undefined);
  const email = state.status === "error" ? state.email : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const found = checkEmail(String(new FormData(event.currentTarget).get("email") ?? ""));
    setClientError(found);
    if (found) {
      event.preventDefault();
      focusFirstInvalid(event.currentTarget, ["email"]);
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormStatus focusKey={state.status === "submitted" ? state : null}>
        <Result state={state} />
      </FormStatus>
      <TextField
        key={email ?? ""}
        id="forgot-email"
        name="email"
        type="email"
        label="Email address"
        autoComplete="email"
        required
        maxLength={AUTH_LIMITS.emailMax}
        defaultValue={email}
        error={error}
      />
      <Button type="submit" size="lg" fullWidth loading={pending} loadingText="Sending…">
        Send reset link
      </Button>
    </form>
  );
}

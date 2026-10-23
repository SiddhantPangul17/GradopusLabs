"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent, type ReactNode } from "react";
import { FormStatus, focusFirstInvalid } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { loginAction } from "@/lib/auth/actions";
import type { LoginState } from "@/lib/auth/action-types";
import { AUTH_LIMITS, checkLogin, type FieldErrors } from "@/lib/validation/auth-rules";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ callbackUrl, notice }: { callbackUrl: string; notice?: ReactNode }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [clientErrors, setClientErrors] = useState<FieldErrors<"email" | "password">>({});

  const serverErrors = state.status === "error" ? (state.errors ?? {}) : {};
  const errors = Object.keys(clientErrors).length > 0 ? clientErrors : serverErrors;
  const email = state.status === "error" ? state.email : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const found = checkLogin({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
    setClientErrors(found);
    if (Object.keys(found).length > 0) {
      event.preventDefault();
      focusFirstInvalid(event.currentTarget, Object.keys(found));
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-5">
      {notice}
      <FormStatus focusKey={state.status === "idle" ? null : state}>
        {state.status === "error" && state.message && <Notice tone="error" title="Could not log in">{state.message}</Notice>}
      </FormStatus>

      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {/* Remount after each response so the email field shows the submitted value (passwords are never refilled). */}
      <div key={email ?? ""} className="space-y-5">
        <TextField
          id="login-email"
          name="email"
          type="email"
          label="Email address"
          autoComplete="email"
          required
          maxLength={AUTH_LIMITS.emailMax}
          defaultValue={email}
          error={errors.email}
        />
        <TextField
          id="login-password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          maxLength={AUTH_LIMITS.passwordMax * 4}
          error={errors.password}
        />
      </div>

      <div className="flex justify-end">
        <Link href="/forgot-password" className="rounded-control type-supporting font-medium text-primary hover:underline">
          Forgot your password?
        </Link>
      </div>

      <Button type="submit" size="lg" fullWidth loading={pending} loadingText="Logging in…">
        Log in
      </Button>
    </form>
  );
}

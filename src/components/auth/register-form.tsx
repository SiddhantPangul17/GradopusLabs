"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";
import { FormStatus, focusFirstInvalid } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { CheckboxField, TextField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { registerAction } from "@/lib/auth/actions";
import type { RegisterState } from "@/lib/auth/action-types";
import { AUTH_LIMITS, checkRegistration, type FieldErrors, type RegistrationFields } from "@/lib/validation/auth-rules";

const initialState: RegisterState = { status: "idle" };
const FIELD_ORDER = ["name", "email", "password", "confirmPassword", "acceptTerms"] as const;

function PolicyLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} target="_blank" rel="noopener" className="font-semibold text-primary underline underline-offset-2">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </Link>
  );
}

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const [clientErrors, setClientErrors] = useState<FieldErrors<RegistrationFields>>({});

  const serverErrors = state.status === "error" ? (state.errors ?? {}) : {};
  const errors = Object.keys(clientErrors).length > 0 ? clientErrors : serverErrors;
  const values = state.status === "error" ? state.values : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const found = checkRegistration({
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      confirmPassword: String(data.get("confirmPassword") ?? ""),
      acceptTerms: data.get("acceptTerms") === "on",
    });
    setClientErrors(found);
    if (Object.keys(found).length > 0) {
      event.preventDefault();
      focusFirstInvalid(event.currentTarget, FIELD_ORDER.filter((field) => field in found));
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormStatus focusKey={state.status === "idle" ? null : state}>
        {state.status === "error" && state.message && (
          <Notice tone="error" title="Could not create your account">
            {state.message}
          </Notice>
        )}
        {state.status === "error" && !state.message && Object.keys(serverErrors).length > 0 && (
          <Notice tone="error" title="Please check the form">
            Each problem is described below the field.
          </Notice>
        )}
      </FormStatus>

      <div key={JSON.stringify(values ?? {})} className="space-y-5">
        <TextField
          id="register-name"
          name="name"
          label="Full name"
          autoComplete="name"
          required
          maxLength={AUTH_LIMITS.nameMax}
          defaultValue={values?.name}
          error={errors.name}
        />
        <TextField
          id="register-email"
          name="email"
          type="email"
          label="Email address"
          autoComplete="email"
          required
          maxLength={AUTH_LIMITS.emailMax}
          defaultValue={values?.email}
          error={errors.email}
        />
        <TextField
          id="register-password"
          name="password"
          type="password"
          label="Password"
          hint={`At least ${AUTH_LIMITS.passwordMin} characters. A passphrase of a few unrelated words works well.`}
          autoComplete="new-password"
          required
          maxLength={AUTH_LIMITS.passwordMax}
          error={errors.password}
        />
        <TextField
          id="register-confirm-password"
          name="confirmPassword"
          type="password"
          label="Confirm password"
          autoComplete="new-password"
          required
          maxLength={AUTH_LIMITS.passwordMax}
          error={errors.confirmPassword}
        />
        <CheckboxField
          id="register-accept-terms"
          name="acceptTerms"
          required
          defaultChecked={values?.acceptTerms}
          label={
            <>
              I agree to the <PolicyLink href="/terms">Terms and Conditions</PolicyLink> and the{" "}
              <PolicyLink href="/privacy">Privacy Policy</PolicyLink>.
            </>
          }
          error={errors.acceptTerms}
        />
      </div>

      {/* Honeypot for spam bots: hidden from people and assistive tech, never focusable. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="register-website">Leave this field empty</label>
        <input id="register-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <Button type="submit" size="lg" fullWidth loading={pending} loadingText="Creating account…">
        Create account
      </Button>
    </form>
  );
}

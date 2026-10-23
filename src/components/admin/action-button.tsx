"use client";

import { useActionState } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { IDLE, type FormResult } from "@/lib/form-result";

type ActionButtonProps = {
  /** A Server Action with its arguments already bound. */
  action: () => Promise<FormResult>;
  label: string;
  pendingLabel?: string;
  /** Accessible name when the visible label is ambiguous (e.g. "Move up"). */
  ariaLabel?: string;
  variant?: ButtonVariant;
};

/** One-click admin action (publish toggle, reorder) that reports refusals inline. */
export function ActionButton({ action, label, pendingLabel, ariaLabel, variant = "outline" }: ActionButtonProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <Button type="submit" size="sm" variant={variant} loading={pending} loadingText={pendingLabel ?? "Saving…"} aria-label={ariaLabel}>
        {label}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="type-meta max-w-md text-error">
          {state.message}
        </p>
      )}
    </form>
  );
}

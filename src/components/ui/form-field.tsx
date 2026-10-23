import type { ComponentProps, ReactNode } from "react";
import { AlertCircleIcon, ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/*
 * Accessible form fields. Each field renders its own <label>, optional hint
 * and error message, and wires them to the control with aria-describedby and
 * aria-invalid, so consumers only pass an `id`, a `label` and control props.
 */

/** Shared look for text-like controls; exported for rare custom controls. */
export const controlStyles = cn(
  "block w-full rounded-control border border-border-strong bg-background px-3 type-body text-foreground shadow-xs",
  "placeholder:text-muted transition-[border-color,box-shadow] hover:border-foreground/50",
  // The global 2px outline sits flush on the border, with a soft brand halo around it.
  "focus-visible:border-primary focus-visible:outline-offset-0 focus-visible:ring-4 focus-visible:ring-primary/15",
  "aria-invalid:border-error",
  "disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted",
);

type FieldMeta = {
  /** Required: links the label, hint and error text to the control. */
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  /** Validation message. When set, the control is marked aria-invalid. */
  error?: ReactNode;
  className?: string;
};

function describedBy(id: string, hint: ReactNode, error: ReactNode): string | undefined {
  const ids = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function RequiredMark() {
  // Visual marker only; the native `required` attribute informs assistive tech.
  return (
    <span aria-hidden="true" className="ml-0.5 text-error">
      *
    </span>
  );
}

function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={`${id}-hint`} className="type-supporting text-muted">
      {children}
    </p>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={`${id}-error`} className="flex items-start gap-1.5 type-supporting font-medium text-error">
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

type ShellProps = Omit<FieldMeta, "className"> & { required?: boolean; className?: string; children: ReactNode };

function FieldShell({ id, label, hint, error, required, className, children }: ShellProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="type-label text-foreground">
        {label}
        {required && <RequiredMark />}
      </label>
      {hint && <FieldHint id={id}>{hint}</FieldHint>}
      {children}
      {error && <FieldError id={id}>{error}</FieldError>}
    </div>
  );
}

type TextFieldProps = FieldMeta &
  Omit<ComponentProps<"input">, "id" | "type" | "className"> & {
    type?: "text" | "email" | "tel" | "url" | "password" | "number" | "search" | "date" | "datetime-local";
  };

export function TextField({ id, label, hint, error, className, type = "text", required, ...props }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input
        id={id}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlStyles, "h-11")}
        {...props}
      />
    </FieldShell>
  );
}

type TextareaFieldProps = FieldMeta & Omit<ComponentProps<"textarea">, "id" | "className">;

export function TextareaField({ id, label, hint, error, className, required, rows = 4, ...props }: TextareaFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlStyles, "min-h-24 py-2.5")}
        {...props}
      />
    </FieldShell>
  );
}

type SelectFieldProps = FieldMeta & Omit<ComponentProps<"select">, "id" | "className">;

export function SelectField({ id, label, hint, error, className, required, children, ...props }: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <div className="relative">
        <select
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(controlStyles, "h-11 appearance-none pr-10")}
          {...props}
        >
          {children}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
      </div>
    </FieldShell>
  );
}

type CheckboxFieldProps = FieldMeta & Omit<ComponentProps<"input">, "id" | "type" | "className">;

export function CheckboxField({ id, label, hint, error, className, required, ...props }: CheckboxFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
          {...props}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="type-label cursor-pointer text-foreground">
            {label}
            {required && <RequiredMark />}
          </label>
          {hint && <FieldHint id={id}>{hint}</FieldHint>}
        </div>
      </div>
      {error && <FieldError id={id}>{error}</FieldError>}
    </div>
  );
}

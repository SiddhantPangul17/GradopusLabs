import Link from "next/link";
import type { ComponentProps } from "react";
import { ArrowRightIcon, CheckIcon, SpinnerIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

// Filled and outline buttons lift 1px on hover; every variant presses in slightly when clicked.
const lift = "hover:-translate-y-px active:translate-y-0";

const variants = {
  primary: cn("bg-primary text-on-primary shadow-button hover:bg-primary-strong hover:shadow-button-hover", lift),
  secondary: cn("bg-secondary text-secondary-foreground hover:shadow-card hover:brightness-97", lift),
  outline: cn("border border-border bg-background text-foreground shadow-card hover:border-border-strong/70 hover:bg-surface", lift),
  ghost: "text-foreground hover:bg-foreground/5",
  destructive: cn("bg-error text-on-primary shadow-button hover:bg-error/90", lift),
} as const;

// md (44px) is the default so touch targets stay comfortable on phones.
// Single-line buttons use a fixed height; multiline ones a minimum height.
const sizes = {
  sm: { single: "h-9 px-4", multi: "min-h-9 px-4 py-1.5" },
  md: { single: "h-11 px-5", multi: "min-h-11 px-5 py-2.5" },
  lg: { single: "h-12 px-7", multi: "min-h-12 px-7 py-3" },
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Let long labels (e.g. titles) wrap instead of staying on one line. */
  multiline?: boolean;
  className?: string;
};

/** Class names for button-styled elements; exported for rare custom cases. */
export function buttonStyles({
  variant = "primary",
  size = "md",
  fullWidth = false,
  multiline = false,
  className,
}: ButtonStyleOptions = {}) {
  return cn(
    "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-button type-button select-none",
    "transition-[color,background-color,border-color,box-shadow,translate,scale,filter] active:scale-98",
    multiline ? "text-center" : "whitespace-nowrap",
    variants[variant],
    // After the variant so a disabled button never lifts, presses or glows.
    "disabled:cursor-not-allowed disabled:opacity-55 disabled:translate-y-0 disabled:scale-100 disabled:shadow-none disabled:brightness-100",
    multiline ? sizes[size].multi : sizes[size].single,
    fullWidth && "w-full",
    className,
  );
}

/** Trailing arrow that nudges forward on hover; use for "go to" calls to action. */
export function ButtonArrow() {
  return <ArrowRightIcon className="size-4 transition-transform group-hover/button:translate-x-0.5" />;
}

type ButtonProps = ComponentProps<"button"> &
  Omit<ButtonStyleOptions, "className"> & {
    /** Disables the button and shows a spinner. */
    loading?: boolean;
    /** Optional replacement label while loading, e.g. "Saving…". */
    loadingText?: string;
    /** Shows a check mark after the label, e.g. once the last save succeeded. */
    success?: boolean;
  };

/** A native <button>. Defaults to type="button" so it never submits a form by accident. */
export function Button({
  variant,
  size,
  fullWidth,
  multiline,
  loading = false,
  loadingText,
  success = false,
  disabled,
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, multiline, className })}
      {...props}
    >
      {loading && <SpinnerIcon className="size-4 animate-spin" />}
      {loading && loadingText ? loadingText : children}
      {success && !loading && <CheckIcon className="size-4 animate-pop-in" />}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & Omit<ButtonStyleOptions, "className">;

/** A next/link navigation link styled as a button. */
export function ButtonLink({ variant, size, fullWidth, multiline, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonStyles({ variant, size, fullWidth, multiline, className })} {...props} />;
}

import { cn } from "@/lib/utils";

type ProgressBarProps = {
  /** 0–100 */
  percent: number;
  /** Accessible name, e.g. "Web Development Fundamentals progress". */
  label: string;
  /** Visible description of the value, e.g. "2 of 5 modules completed". */
  valueText: string;
  className?: string;
};

/** A progress bar that states its value in text as well as visually. */
export function ProgressBar({ percent, label, valueText, className }: ProgressBarProps) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 type-supporting">
        <span className="text-muted">{valueText}</span>
        <span className="font-semibold text-foreground">{value}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${value}%, ${valueText}`}
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-foreground/10"
      >
        <div className={cn("h-full origin-left animate-grow-x rounded-full bg-linear-to-r from-primary to-primary-strong")} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

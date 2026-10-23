import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  MinusCircleIcon,
  XCircleIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type Status = "success" | "pending" | "warning" | "error" | "neutral";

// Tinted background + coloured icon convey the status visually; the text stays
// in the high-contrast foreground colour, and the label itself carries meaning,
// so colour is never the only signal.
const statusStyles: Record<Status, { container: string; icon: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = {
  success: { container: "bg-success/10 ring-success/25", icon: "text-success", Icon: CheckCircleIcon },
  pending: { container: "bg-info/10 ring-info/25", icon: "text-info", Icon: ClockIcon },
  warning: { container: "bg-warning/10 ring-warning/25", icon: "text-warning", Icon: AlertTriangleIcon },
  error: { container: "bg-error/10 ring-error/25", icon: "text-error", Icon: XCircleIcon },
  neutral: { container: "bg-foreground/5 ring-foreground/10", icon: "text-muted", Icon: MinusCircleIcon },
};

type StatusBadgeProps = {
  status: Status;
  /** Readable status text, e.g. "Verified", "Payment pending". Required. */
  children: ReactNode;
  className?: string;
};

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  const { container, icon, Icon } = statusStyles[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 type-meta font-semibold text-foreground ring-1 ring-inset",
        container,
        className,
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", icon)} />
      {children}
    </span>
  );
}

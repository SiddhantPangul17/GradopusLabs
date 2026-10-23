import type { ComponentType, ReactNode, SVGProps } from "react";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XCircleIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type NoticeTone = "info" | "success" | "warning" | "error";

const tones: Record<NoticeTone, { container: string; icon: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = {
  info: { container: "border-info/30 bg-info/5", icon: "text-info", Icon: InfoIcon },
  success: { container: "border-success/30 bg-success/5", icon: "text-success", Icon: CheckCircleIcon },
  warning: { container: "border-warning/30 bg-warning/5", icon: "text-warning", Icon: AlertTriangleIcon },
  error: { container: "border-error/30 bg-error/5", icon: "text-error", Icon: XCircleIcon },
};

type NoticeProps = {
  tone?: NoticeTone;
  /** Short summary; always include one so the message never relies on colour alone. */
  title: string;
  children?: ReactNode;
  className?: string;
};

/** An inline callout for important information, such as unfinished features or form results. */
export function Notice({ tone = "info", title, children, className }: NoticeProps) {
  const { container, icon, Icon } = tones[tone];

  return (
    <div className={cn("flex animate-fade-up-sm gap-3 rounded-card border p-4", container, className)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", icon)} />
      <div className="min-w-0 space-y-1">
        <p className="type-label text-foreground">{title}</p>
        {children && <div className="type-supporting text-foreground/80">{children}</div>}
      </div>
    </div>
  );
}

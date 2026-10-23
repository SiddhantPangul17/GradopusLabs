import type { Status } from "@/components/ui/status-badge";
import { formatMinorUnits } from "@/lib/utils";
import type { Program, ProgramAvailability, ProgramLevel } from "@/types";

/** Display helpers shared by program cards and the program details page. */

export const levelLabels: Record<ProgramLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const availabilityDisplay: Record<ProgramAvailability, { status: Status; label: string }> = {
  open: { status: "success", label: "Enrolment open" },
  "coming-soon": { status: "pending", label: "Enrolment not open yet" },
  closed: { status: "neutral", label: "Enrolment closed" },
};

export function formatDuration(weeks: number): string {
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

export function formatProgramPrice(program: Pick<Program, "pricePaise" | "currency">): string {
  return formatMinorUnits(program.pricePaise, program.currency);
}

export function programHref(slug: string): string {
  return `/programs/${encodeURIComponent(slug)}`;
}

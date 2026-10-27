import type { Status } from "@/components/ui/status-badge";
import { formatMinorUnits } from "@/lib/utils";
import type { Program, ProgramAvailability, ProgramLevel, ProgramModule } from "@/types";

/** Display helpers shared by program cards and the program details page. */

export const levelLabels: Record<ProgramLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const availabilityDisplay: Record<ProgramAvailability, { status: Status; label: string }> = {
  open: { status: "success", label: "Enrollment open" },
  "coming-soon": { status: "pending", label: "Enrollment not open yet" },
  closed: { status: "neutral", label: "Enrollment closed" },
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

/**
 * How a curriculum module reads on the program page. Admins sometimes enter a
 * placeholder title ("Module 3") and put the real one in a single topic, as in
 * "JavaScript: Variables, functions and events". That is shown as the title
 * "JavaScript" with the rest as its description. A single topic is shown as a
 * sentence; several topics are shown as a list.
 */
export function moduleDisplay(module: ProgramModule): { title: string; summary: string | null; topics: readonly string[] } {
  const title = module.title.trim();
  const isPlaceholder = title === "" || /^module\s*\d+$/i.test(title);

  if (module.topics.length !== 1) return { title, summary: null, topics: module.topics };

  const [topic] = module.topics;
  if (!isPlaceholder) return { title, summary: topic, topics: [] };

  const colon = topic.indexOf(":");
  const head = colon > 0 ? topic.slice(0, colon).trim() : "";
  const rest = colon > 0 ? topic.slice(colon + 1).trim() : "";
  if (head && rest) return { title: head, summary: rest, topics: [] };
  return { title: topic, summary: null, topics: [] };
}

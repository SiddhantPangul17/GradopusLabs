import { Notice } from "@/components/ui/notice";
import { getProgramDataSource } from "@/lib/programs";

/** Shown wherever programs appear while they come from development fixtures (never in production). */
export function ProgramFixtureNotice({ className }: { className?: string }) {
  if (getProgramDataSource() !== "fixtures") return null;

  return (
    <Notice tone="info" title="Sample programs for preview" className={className}>
      These listings are development samples used to preview the website because no database is configured. They are
      not real programs and are not open for enrollment.
    </Notice>
  );
}

import type { ReactNode } from "react";

/**
 * Re-mounts when the student switches sections (Overview, My programs, …),
 * so the new section fades in gently. Purely visual: it never delays navigation.
 */
export default function StudentTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-fade-up-sm">{children}</div>;
}

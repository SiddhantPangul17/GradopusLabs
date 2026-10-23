import { CheckCircleIcon, ClockIcon } from "@/components/ui/icons";

/*
 * Decorative, CSS-only illustration: a code editor beside a project task list.
 * Exposed to assistive tech as a single image with a text description.
 */

const codeLines = [
  [{ t: "// Task 3 · Project card component", c: "text-background/50" }],
  [
    { t: "export function ", c: "text-secondary" },
    { t: "ProjectCard", c: "text-background" },
    { t: "({ title }) {", c: "text-background/70" },
  ],
  [{ t: "  return (", c: "text-secondary" }],
  [{ t: '    <article className="card">', c: "text-background/80" }],
  [{ t: "      <h3>{title}</h3>", c: "text-background/80" }],
  [{ t: "    </article>", c: "text-background/80" }],
  [{ t: "  );", c: "text-background/70" }],
  [{ t: "}", c: "text-background/70" }],
] as const;

const tasks = [
  { label: "Page layout", state: "Accepted", done: true },
  { label: "Navigation menu", state: "Accepted", done: true },
  { label: "Project card", state: "Submitted", done: false },
] as const;

export function HeroIllustration() {
  return (
    <div
      role="img"
      aria-label="Illustration: a code editor showing a project task, next to a checklist of submitted and accepted tasks"
      // min-w-0: stop the unwrapped code lines from widening the parent grid column on small screens.
      className="relative isolate mx-auto mb-10 w-full max-w-md min-w-0 animate-fade-up stagger-2 lg:mb-0 lg:max-w-none"
    >
      {/* Soft brand glow behind the editor; decorative. */}
      <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-full bg-primary/15 blur-3xl" />
      <div className="overflow-hidden rounded-card border border-foreground/10 bg-foreground shadow-raised">
        <div className="flex items-center gap-2 border-b border-background/10 px-4 py-3">
          <span className="size-2.5 rounded-full bg-background/25" />
          <span className="size-2.5 rounded-full bg-background/25" />
          <span className="size-2.5 rounded-full bg-background/25" />
          <span className="ml-2 truncate font-mono text-xs text-background/60">src/components/project-card.jsx</span>
        </div>
        <pre className="overflow-hidden px-4 py-4 font-mono text-[0.6875rem] leading-6 sm:text-[0.8125rem]">
          <code>
            {codeLines.map((line, index) => (
              <span key={index} className="block whitespace-pre">
                <span className="mr-4 inline-block w-4 text-right text-background/30 select-none">{index + 1}</span>
                {line.map((part) => (
                  <span key={part.t} className={part.c}>
                    {part.t}
                  </span>
                ))}
                {index === codeLines.length - 1 && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-secondary" />
                )}
              </span>
            ))}
          </code>
        </pre>
      </div>

      <div className="absolute right-4 -bottom-10 w-60 animate-fade-up rounded-card border border-border bg-background/95 p-4 shadow-raised backdrop-blur stagger-5 sm:-right-4 lg:-right-6">
        <p className="type-label text-foreground">Project tasks</p>
        <ul className="mt-3 space-y-2.5">
          {tasks.map((task, index) => (
            <li
              key={task.label}
              className="flex animate-fade-up-sm items-center gap-2.5"
              style={{ animationDelay: `${560 + index * 90}ms` }}
            >
              {task.done ? (
                <CheckCircleIcon className="size-4 shrink-0 text-success" />
              ) : (
                <ClockIcon className="size-4 shrink-0 text-info" />
              )}
              <span className="type-supporting flex-1 text-foreground">{task.label}</span>
              <span className="type-meta text-muted">{task.state}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

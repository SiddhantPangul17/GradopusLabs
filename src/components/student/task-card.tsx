import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { ArrowRightIcon, ChevronRightIcon, LinkIcon, PenLineIcon, UploadIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import type { TaskType } from "@/lib/constants";
import { formatDateTime, taskStateDisplay, taskTypeLabel } from "@/lib/learning/labels";
import type { TaskState } from "@/lib/learning/progress";
import type { TaskSummary } from "@/lib/services/learning-service";
import { cn } from "@/lib/utils";

/*
 * Task links for the student area. The whole card (or row) is one link: the
 * title is the link's accessible name and a pseudo-element stretches its hit
 * area over the card, so there is exactly one tab stop per task and no nested
 * interactive elements. Keyboard focus outlines the whole card.
 */

const typeIcon: Record<TaskType, ComponentType<SVGProps<SVGSVGElement>>> = {
  project_url: LinkIcon,
  text: PenLineIcon,
  file: UploadIcon,
};

/** What opening the task lets the student do next, in their words. */
const actionLabel: Record<TaskState, string> = {
  not_started: "Start task",
  awaiting_review: "View submission",
  changes_requested: "Revise and resubmit",
  rejected: "Try again",
  completed: "View task",
};

const completionLabel = {
  review: "Reviewed by an instructor",
  submission: "Completes when you submit",
} as const;

const stretchedLink = "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none";
const focusWithin = "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring";

function taskHref(taskId: string): string {
  return `/student/tasks/${encodeURIComponent(taskId)}`;
}

/** Full task card, used on the module page. */
export function TaskCard({ task, readOnly = false }: { task: TaskSummary; readOnly?: boolean }) {
  const Icon = typeIcon[task.taskType];
  const state = taskStateDisplay[task.state];
  // File uploads are not available yet, so there is nothing to "start".
  const action = readOnly ? "View task" : task.taskType === "file" ? "View details" : actionLabel[task.state];

  return (
    <article
      className={cn(
        "group relative flex gap-4 rounded-card border border-border bg-background p-4 shadow-card sm:p-5",
        "transition-[border-color,box-shadow,translate] duration-300 ease-out-soft hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-hover",
        focusWithin,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-control bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-on-primary"
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <h3 className="type-card-title wrap-anywhere text-foreground transition-colors group-hover:text-primary">
            <Link href={taskHref(task.id)} className={stretchedLink}>
              {task.title}
            </Link>
          </h3>
          <StatusBadge status={state.status} className="self-start">
            {state.label}
          </StatusBadge>
        </div>

        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 type-meta text-muted" aria-label="Task details">
          <li>{taskTypeLabel[task.taskType]}</li>
          <li aria-hidden="true">·</li>
          <li className={cn(task.required && "font-semibold text-foreground")}>{task.required ? "Required" : "Optional"}</li>
          <li aria-hidden="true">·</li>
          <li>{completionLabel[task.completionRule]}</li>
          {task.dueDate && (
            <>
              <li aria-hidden="true">·</li>
              <li>
                Due <time dateTime={task.dueDate}>{formatDateTime(task.dueDate)}</time>
              </li>
            </>
          )}
        </ul>

        {task.description && <p className="type-supporting mt-3 line-clamp-2 text-muted">{task.description}</p>}

        <span
          aria-hidden="true"
          className="mt-4 inline-flex items-center gap-1.5 type-label font-semibold text-primary"
        >
          {action}
          <ArrowRightIcon className="size-4 transition-transform duration-300 ease-out-soft group-hover:translate-x-1" />
        </span>
      </div>
    </article>
  );
}

/** Compact task row, used inside module cards on the program page. */
export function TaskRow({ task }: { task: TaskSummary }) {
  const Icon = typeIcon[task.taskType];
  const state = taskStateDisplay[task.state];

  // Phones: the badge sits under the title so the title keeps the full width.
  // Larger screens: icon | title | badge | chevron on one line.
  return (
    <div
      className={cn(
        "group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-control px-3 py-2.5 transition-colors hover:bg-secondary/60",
        "sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]",
        focusWithin,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 self-start text-muted group-hover:text-primary sm:self-center" />
      <div className="min-w-0">
        <Link href={taskHref(task.id)} className={cn("type-supporting font-medium wrap-break-word text-foreground group-hover:text-primary", stretchedLink)}>
          {task.title}
        </Link>
        <p className="type-meta text-muted">
          {taskTypeLabel[task.taskType]} · {task.required ? "Required" : "Optional"}
        </p>
      </div>
      <StatusBadge status={state.status} className="col-start-2 row-start-2 justify-self-start sm:col-start-3 sm:row-start-1">
        {state.label}
      </StatusBadge>
      <ChevronRightIcon
        aria-hidden="true"
        className="col-start-3 row-span-2 row-start-1 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary sm:col-start-4 sm:row-span-1"
      />
    </div>
  );
}

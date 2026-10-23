import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/action-button";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { EMPTY_TASK, ModuleForm, TaskForm } from "@/components/admin/content-forms";
import { Card, CardTitle } from "@/components/ui/card";
import { ChevronDownIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createTaskAction,
  moveTaskAction,
  setTaskPublishedAction,
  updateModuleAction,
  updateTaskAction,
} from "@/lib/admin/actions";
import { isoToIstLocal } from "@/lib/admin/form-parsing";
import { requireAdmin } from "@/lib/auth/session";
import { taskTypeLabel } from "@/lib/learning/labels";
import { getModuleForAdmin, type AdminTaskItem } from "@/lib/services/admin-content-service";

export const metadata: Metadata = { title: "Module · Admin", robots: { index: false } };

type Params = PageProps<"/admin/programs/[programId]/modules/[moduleId]">;

function taskValues(task: AdminTaskItem) {
  return {
    title: task.title,
    slug: task.slug,
    description: task.description,
    instructions: task.instructions,
    taskType: task.taskType,
    required: task.required,
    completionRule: task.completionRule,
    dueDate: isoToIstLocal(task.dueDate ? new Date(task.dueDate) : null),
    evaluationCriteria: task.evaluationCriteria.join("\n"),
    isPublished: task.isPublished,
  };
}

async function ModuleEditor({ params, searchParams }: { params: Params["params"]; searchParams: Params["searchParams"] }) {
  const { programId, moduleId } = await params;
  const admin = await requireAdmin(`/admin/programs/${encodeURIComponent(programId)}/modules/${encodeURIComponent(moduleId)}`);
  const result = await getModuleForAdmin({ id: admin.id, role: admin.role }, programId, moduleId);
  if (!result.ok) notFound();
  const { program, module, tasks, activeEnrollments } = result.data;
  const created = (await searchParams).created === "1";

  return (
    <>
      <AdminHeader
        title={module.title}
        breadcrumb={[
          { label: "Programs", href: "/admin/programs" },
          { label: program.title, href: `/admin/programs/${program.id}` },
          { label: "Modules", href: `/admin/programs/${program.id}/modules` },
        ]}
        description={<StatusBadge status={module.isPublished ? "success" : "neutral"}>{module.isPublished ? "Published" : "Hidden (draft)"}</StatusBadge>}
      />
      {created && <Notice tone="success" title="Module created" className="mb-6">Add tasks below, then publish the module when it is ready.</Notice>}
      {activeEnrollments > 0 && (
        <Notice tone="info" title={`${activeEnrollments} students are actively enrolled`} className="mb-6">
          Publishing or hiding tasks, or changing whether a task is required or how it is completed, updates their progress
          immediately. Their submissions and history are always kept.
        </Notice>
      )}

      <div className="grid gap-10 xl:grid-cols-2">
        <Card as="section" aria-labelledby="module-heading" className="min-w-0">
          <CardTitle as="h2" id="module-heading">
            Module details
          </CardTitle>
          <div className="mt-5">
            <ModuleForm
              action={updateModuleAction.bind(null, program.id, module.id)}
              idPrefix="module"
              submitLabel="Save module"
              initial={{
                title: module.title,
                slug: module.slug,
                description: module.description,
                content: module.content,
                estimatedDurationMinutes: module.estimatedDurationMinutes ? String(module.estimatedDurationMinutes) : "",
                isPublished: module.isPublished,
              }}
            />
          </div>
        </Card>

        <section aria-labelledby="tasks-heading" className="min-w-0">
          <h2 id="tasks-heading" className="type-section-title text-foreground">
            Tasks
          </h2>
          {tasks.length === 0 ? (
            <p className="type-body mt-3 text-muted">No tasks yet. Modules without required tasks are completed by students marking them as read.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {tasks.map((task, index) => (
                <li key={task.id}>
                  <Card className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="type-label wrap-anywhere text-foreground">{task.title}</p>
                        <p className="type-meta mt-1 text-muted">
                          {taskTypeLabel[task.taskType]} · {task.required ? "Required" : "Optional"} ·{" "}
                          {task.completionRule === "review" ? "Instructor review" : "Completes on submission"} · {task.submissions} submissions
                        </p>
                      </div>
                      <StatusBadge status={task.isPublished ? "success" : "neutral"}>{task.isPublished ? "Published" : "Draft"}</StatusBadge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton
                        action={setTaskPublishedAction.bind(null, program.id, module.id, task.id, !task.isPublished)}
                        label={task.isPublished ? "Hide" : "Publish"}
                        ariaLabel={`${task.isPublished ? "Hide" : "Publish"} task ${task.title}`}
                      />
                      {index > 0 && <ActionButton action={moveTaskAction.bind(null, program.id, module.id, task.id, "up")} label="↑" ariaLabel={`Move ${task.title} up`} variant="ghost" />}
                      {index < tasks.length - 1 && (
                        <ActionButton action={moveTaskAction.bind(null, program.id, module.id, task.id, "down")} label="↓" ariaLabel={`Move ${task.title} down`} variant="ghost" />
                      )}
                    </div>
                    <details className="group mt-3 border-t border-border pt-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between rounded-control type-button text-primary [&::-webkit-details-marker]:hidden">
                        Edit task
                        <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-4">
                        <TaskForm
                          action={updateTaskAction.bind(null, program.id, module.id, task.id)}
                          idPrefix={`task-${task.id}`}
                          submitLabel="Save task"
                          initial={taskValues(task)}
                          typeLocked={task.submissions > 0}
                        />
                      </div>
                    </details>
                  </Card>
                </li>
              ))}
            </ol>
          )}

          <Card as="section" aria-labelledby="add-task-heading" className="mt-8">
            <CardTitle as="h3" id="add-task-heading">
              Add a task
            </CardTitle>
            <div className="mt-5">
              <TaskForm action={createTaskAction.bind(null, program.id, module.id)} idPrefix="new-task" submitLabel="Add task" initial={EMPTY_TASK} resetOnSuccess />
            </div>
          </Card>
        </section>
      </div>
    </>
  );
}

export default function ModuleEditorPage({ params, searchParams }: Params) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <ModuleEditor params={params} searchParams={searchParams} />
    </Suspense>
  );
}

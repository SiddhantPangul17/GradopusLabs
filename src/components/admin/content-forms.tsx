"use client";

import { AdminForm } from "@/components/admin/admin-form";
import { CheckboxField, SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import type { FormResult } from "@/lib/form-result";

type Action = (previous: FormResult, formData: FormData) => Promise<FormResult>;

export type ModuleFormValues = {
  title: string;
  slug: string;
  description: string;
  content: string;
  estimatedDurationMinutes: string;
  isPublished: boolean;
};

export function ModuleForm({
  action,
  initial,
  submitLabel,
  idPrefix,
  resetOnSuccess,
}: {
  action: Action;
  initial: ModuleFormValues;
  submitLabel: string;
  idPrefix: string;
  resetOnSuccess?: boolean;
}) {
  return (
    <AdminForm action={action} submitLabel={submitLabel} pendingLabel="Saving…" resetOnSuccess={resetOnSuccess}>
      {(errors) => (
        <>
          <TextField id={`${idPrefix}-title`} name="title" label="Title" required maxLength={150} defaultValue={initial.title} error={errors.title} />
          <TextField
            id={`${idPrefix}-slug`}
            name="slug"
            label="Identifier (slug)"
            hint="Used to match content imports. Leave empty to create it from the title. The module's internal id never changes."
            maxLength={100}
            defaultValue={initial.slug}
            error={errors.slug}
          />
          <TextareaField id={`${idPrefix}-description`} name="description" label="Short description" rows={2} maxLength={1000} defaultValue={initial.description} error={errors.description} />
          <TextareaField
            id={`${idPrefix}-content`}
            name="content"
            label="Learning content (Markdown)"
            hint="Headings, lists, links, code and emphasis are supported. HTML and scripts are never rendered; images are not shown yet."
            rows={12}
            defaultValue={initial.content}
            error={errors.content}
          />
          <TextField
            id={`${idPrefix}-minutes`}
            name="estimatedDurationMinutes"
            type="number"
            label="Estimated duration (minutes)"
            hint="Optional."
            min={1}
            defaultValue={initial.estimatedDurationMinutes}
            error={errors.estimatedDurationMinutes}
          />
          <CheckboxField
            id={`${idPrefix}-published`}
            name="isPublished"
            label="Published (visible to enrolled students)"
            hint="Unpublished modules are hidden and do not count towards progress."
            defaultChecked={initial.isPublished}
            error={errors.isPublished}
          />
        </>
      )}
    </AdminForm>
  );
}

export type TaskFormValues = {
  title: string;
  slug: string;
  description: string;
  instructions: string;
  taskType: string;
  required: boolean;
  completionRule: string;
  dueDate: string;
  evaluationCriteria: string;
  isPublished: boolean;
};

export const EMPTY_TASK: TaskFormValues = {
  title: "",
  slug: "",
  description: "",
  instructions: "",
  taskType: "text",
  required: true,
  completionRule: "review",
  dueDate: "",
  evaluationCriteria: "",
  isPublished: false,
};

export function TaskForm({
  action,
  initial,
  submitLabel,
  idPrefix,
  typeLocked,
  resetOnSuccess,
}: {
  action: Action;
  initial: TaskFormValues;
  submitLabel: string;
  idPrefix: string;
  /** True when students have already submitted (the type cannot change). */
  typeLocked?: boolean;
  resetOnSuccess?: boolean;
}) {
  return (
    <AdminForm action={action} submitLabel={submitLabel} pendingLabel="Saving…" resetOnSuccess={resetOnSuccess}>
      {(errors) => (
        <>
          <TextField id={`${idPrefix}-title`} name="title" label="Title" required maxLength={150} defaultValue={initial.title} error={errors.title} />
          <TextField id={`${idPrefix}-slug`} name="slug" label="Identifier (slug)" hint="Unique within the program. Leave empty to create it from the title." maxLength={100} defaultValue={initial.slug} error={errors.slug} />
          <TextareaField id={`${idPrefix}-description`} name="description" label="Short description" rows={2} maxLength={1000} defaultValue={initial.description} error={errors.description} />
          <TextareaField id={`${idPrefix}-instructions`} name="instructions" label="Instructions (Markdown)" hint="Rendered safely: no HTML or scripts." rows={6} defaultValue={initial.instructions} error={errors.instructions} />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              id={`${idPrefix}-type`}
              name="taskType"
              label="Submission type"
              defaultValue={initial.taskType}
              hint={typeLocked ? "Locked: students have already submitted this task." : "File uploads are unavailable until secure storage is configured."}
              disabled={typeLocked}
              error={errors.taskType}
            >
              <option value="text">Written answer</option>
              <option value="project_url">Project link (https)</option>
              {initial.taskType === "file" && <option value="file">File upload (not available)</option>}
            </SelectField>
            {/* A disabled select is not submitted; keep the current value. */}
            {typeLocked && <input type="hidden" name="taskType" value={initial.taskType} />}
            <SelectField id={`${idPrefix}-rule`} name="completionRule" label="Counts as complete" defaultValue={initial.completionRule} error={errors.completionRule}>
              <option value="review">After an instructor accepts it</option>
              <option value="submission">As soon as it is submitted</option>
            </SelectField>
            <TextField id={`${idPrefix}-due`} name="dueDate" type="datetime-local" label="Due date (IST, optional)" hint="Informational: late work is still accepted." defaultValue={initial.dueDate} error={errors.dueDate} />
          </div>
          <TextareaField id={`${idPrefix}-criteria`} name="evaluationCriteria" label="Evaluation criteria" hint="One per line, shown to students." rows={3} defaultValue={initial.evaluationCriteria} error={errors.evaluationCriteria} />
          <CheckboxField
            id={`${idPrefix}-required`}
            name="required"
            label="Required for completion"
            hint="Changing this, the completion rule or publication updates enrolled students' progress immediately."
            defaultChecked={initial.required}
            error={errors.required}
          />
          <CheckboxField id={`${idPrefix}-published`} name="isPublished" label="Published (visible to enrolled students)" defaultChecked={initial.isPublished} error={errors.isPublished} />
        </>
      )}
    </AdminForm>
  );
}

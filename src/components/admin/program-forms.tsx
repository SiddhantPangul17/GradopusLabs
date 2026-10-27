"use client";

import { useActionState, useState } from "react";
import { AdminForm } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import { CheckboxField, SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { IDLE, type FormResult } from "@/lib/form-result";

export type ProgramFormValues = {
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  category: string;
  difficulty: string;
  durationWeeks: string;
  weeklyEffort: string;
  deliveryFormat: string;
  priceRupees: string;
  currency: string;
  learningOutcomes: string;
  prerequisites: string;
  audience: string;
  syllabus: string;
  sampleTasks: string;
  finalProject: string;
  inclusions: string;
  completionCriteria: string;
  availability: string;
  featured: boolean;
  displayOrder: string;
};

export const EMPTY_PROGRAM: ProgramFormValues = {
  title: "",
  slug: "",
  shortDescription: "",
  description: "",
  category: "",
  difficulty: "beginner",
  durationWeeks: "4",
  weeklyEffort: "",
  deliveryFormat: "Online and self-paced",
  priceRupees: "99",
  currency: "INR",
  learningOutcomes: "",
  prerequisites: "",
  audience: "",
  syllabus: "",
  sampleTasks: "",
  finalProject: "",
  inclusions: "",
  completionCriteria: "",
  availability: "coming-soon",
  featured: false,
  displayOrder: "0",
};

const ONE_PER_LINE = "One per line.";

/** Create/edit form for program details. Status changes are a separate, confirmed step. */
export function ProgramForm({
  action,
  initial,
  submitLabel,
  slugLocked,
}: {
  action: (previous: FormResult, formData: FormData) => Promise<FormResult>;
  initial: ProgramFormValues;
  submitLabel: string;
  slugLocked: boolean;
}) {
  return (
    <AdminForm action={action} submitLabel={submitLabel} pendingLabel="Saving…" className="space-y-8">
      {(errors) => (
        <>
          <fieldset className="space-y-5">
            <legend className="type-card-title text-foreground">Basics</legend>
            <TextField id="program-title" name="title" label="Title" required maxLength={120} defaultValue={initial.title} error={errors.title} />
            {slugLocked ? (
              <>
                <TextField id="program-slug" name="slug" label="Slug (web address)" readOnly defaultValue={initial.slug} hint="Locked: this program has been published, and changing its address would break existing links." error={errors.slug} />
              </>
            ) : (
              <TextField
                id="program-slug"
                name="slug"
                label="Slug (web address)"
                hint="Lowercase words joined by hyphens. Leave empty to create it from the title."
                maxLength={100}
                defaultValue={initial.slug}
                error={errors.slug}
              />
            )}
            <TextField id="program-category" name="category" label="Category" required maxLength={60} defaultValue={initial.category} error={errors.category} />
            <TextareaField id="program-short" name="shortDescription" label="Short description" hint="Shown on program cards (up to 300 characters)." required rows={2} maxLength={300} defaultValue={initial.shortDescription} error={errors.shortDescription} />
            <TextareaField id="program-description" name="description" label="Full description" hint="Separate paragraphs with a blank line." required rows={6} defaultValue={initial.description} error={errors.description} />
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="type-card-title text-foreground">Format and price</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField id="program-difficulty" name="difficulty" label="Difficulty" defaultValue={initial.difficulty} error={errors.difficulty}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </SelectField>
              <TextField id="program-weeks" name="durationWeeks" type="number" label="Duration (weeks)" required min={1} max={104} defaultValue={initial.durationWeeks} error={errors.durationWeeks} />
              <TextField id="program-effort" name="weeklyEffort" label="Weekly effort" hint="e.g. 4–6 hours per week" required maxLength={60} defaultValue={initial.weeklyEffort} error={errors.weeklyEffort} />
              <TextField id="program-delivery" name="deliveryFormat" label="Delivery format" required maxLength={200} defaultValue={initial.deliveryFormat} error={errors.deliveryFormat} />
              <TextField
                id="program-price"
                name="priceRupees"
                inputMode="decimal"
                label="Price (₹, rupees)"
                hint="Stored exactly in paise: ₹99 is saved as 9900 paise. Use 0 for free."
                required
                defaultValue={initial.priceRupees}
                error={errors.priceRupees}
              />
              <SelectField id="program-currency" name="currency" label="Currency" defaultValue={initial.currency} error={errors.currency}>
                <option value="INR">INR (Indian rupee)</option>
              </SelectField>
            </div>
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="type-card-title text-foreground">What students learn</legend>
            <TextareaField id="program-outcomes" name="learningOutcomes" label="Learning outcomes" hint={ONE_PER_LINE} rows={4} defaultValue={initial.learningOutcomes} error={errors.learningOutcomes} />
            <TextareaField id="program-prereqs" name="prerequisites" label="Prerequisites" hint={ONE_PER_LINE} rows={3} defaultValue={initial.prerequisites} error={errors.prerequisites} />
            <TextareaField id="program-audience" name="audience" label="Intended audience" hint={ONE_PER_LINE} rows={3} defaultValue={initial.audience} error={errors.audience} />
            <TextareaField id="program-syllabus" name="syllabus" label="Public syllabus outline" hint='One module per line: "Module title: topic one; topic two". Shown on the public program page; the learning modules are managed separately.' rows={5} defaultValue={initial.syllabus} error={errors.syllabus} />
            <TextareaField id="program-sample-tasks" name="sampleTasks" label="Example tasks (public)" hint='One per line: "Task title: short description".' rows={4} defaultValue={initial.sampleTasks} error={errors.sampleTasks} />
            <TextareaField id="program-final" name="finalProject" label="Final project" rows={2} maxLength={1000} defaultValue={initial.finalProject} error={errors.finalProject} />
            <TextareaField id="program-inclusions" name="inclusions" label="What is included" hint={ONE_PER_LINE} rows={4} defaultValue={initial.inclusions} error={errors.inclusions} />
            <TextareaField
              id="program-criteria"
              name="completionCriteria"
              label="Completion criteria (shown to students)"
              hint="One per line. Required before publishing. Certificate eligibility itself is calculated from the required tasks and modules."
              rows={4}
              defaultValue={initial.completionCriteria}
              error={errors.completionCriteria}
            />
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="type-card-title text-foreground">Catalogue</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField id="program-availability" name="availability" label="Enrollment availability (shown publicly)" defaultValue={initial.availability} error={errors.availability}>
                <option value="coming-soon">Enrollment not open yet</option>
                <option value="open">Enrollment open</option>
                <option value="closed">Enrollment closed</option>
              </SelectField>
              <TextField id="program-order" name="displayOrder" type="number" label="Display order" hint="Lower numbers are listed first." defaultValue={initial.displayOrder} error={errors.displayOrder} />
            </div>
            <CheckboxField id="program-featured" name="featured" label="Feature on the homepage" defaultChecked={initial.featured} error={errors.featured} />
          </fieldset>
        </>
      )}
    </AdminForm>
  );
}

const STATUS_COPY: Record<string, { label: string; warning: string; confirm: string }> = {
  published: {
    label: "Publish",
    warning: "The program will appear in the public catalogue with its current details and price.",
    confirm: "I have checked the program details, price and content.",
  },
  archived: {
    label: "Archive",
    warning: "The program leaves the public catalogue and stops accepting new enrollments. Enrolled students keep access; nothing is deleted.",
    confirm: "I understand the program will no longer be offered.",
  },
  draft: {
    label: "Move back to draft",
    warning: "The program leaves the catalogue AND enrolled students lose access to its content until it is published again.",
    confirm: "I understand enrolled students will temporarily lose access.",
  },
};

/** Status change with an explicit confirmation (server re-checks rules and the checklist). */
export function ProgramStatusForm({
  action,
  targets,
}: {
  action: (previous: FormResult, formData: FormData) => Promise<FormResult>;
  targets: string[];
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [target, setTarget] = useState(targets[0] ?? "");
  const copy = STATUS_COPY[target];
  if (targets.length === 0 || !copy) return null;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div role="status" aria-live="polite">
        {state.status === "success" && <Notice tone="success" title={state.message} />}
        {state.status === "error" && <Notice tone="error" title="Status not changed">{state.message}</Notice>}
      </div>
      <SelectField id="status-target" name="target" label="Change status to" value={target} onChange={(event) => setTarget(event.target.value)}>
        {targets.map((option) => (
          <option key={option} value={option}>
            {STATUS_COPY[option]?.label ?? option}
          </option>
        ))}
      </SelectField>
      <p className="type-supporting text-muted">{copy.warning}</p>
      <CheckboxField id="status-confirm" name="confirm" label={copy.confirm} required error={state.status === "error" ? state.fieldErrors?.confirm : undefined} />
      <Button type="submit" variant={target === "published" ? "primary" : "outline"} loading={pending} loadingText="Updating…">
        {copy.label}
      </Button>
    </form>
  );
}

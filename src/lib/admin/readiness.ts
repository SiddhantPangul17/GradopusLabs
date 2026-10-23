/*
 * Publishing checklist. A program may only be published (or stay published
 * after an edit) when this returns no problems. Pure function, unit-tested.
 */

export type ReadinessInput = {
  program: { learningOutcomes: readonly string[]; completionCriteria: readonly string[] };
  modules: readonly { id: string; title: string; isPublished: boolean; content: string }[];
  tasks: readonly {
    moduleId: string;
    title: string;
    isPublished: boolean;
    required: boolean;
    taskType: string;
    instructions: string;
    description: string;
  }[];
  /** Whether secure file storage exists (it does not yet). */
  fileStorageConfigured: boolean;
};

export function publishProblems(input: ReadinessInput): string[] {
  const problems: string[] = [];
  if (input.program.learningOutcomes.length === 0) problems.push("Add at least one learning outcome.");
  if (input.program.completionCriteria.length === 0) problems.push("Add the completion criteria students must meet.");

  const publishedModules = input.modules.filter((module) => module.isPublished);
  if (publishedModules.length === 0) problems.push("Publish at least one learning module.");

  for (const mod of publishedModules) {
    const tasks = input.tasks.filter((task) => task.moduleId === mod.id && task.isPublished);
    if (tasks.length === 0 && !mod.content.trim()) {
      problems.push(`Module "${mod.title}" has no content and no published tasks.`);
    }
    for (const task of tasks) {
      if (task.required && task.taskType === "file" && !input.fileStorageConfigured) {
        problems.push(`Task "${task.title}" is a required file task, but file submissions are not available.`);
      }
      if (task.required && !task.instructions.trim() && !task.description.trim()) {
        problems.push(`Task "${task.title}" needs instructions or a description.`);
      }
    }
  }
  return problems;
}

/** Allowed program status changes. Programs are never deleted (history is kept). */
const PROGRAM_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["published", "archived"],
  published: ["archived", "draft"],
  archived: ["published", "draft"],
};

export function canChangeProgramStatus(from: string, to: string): boolean {
  return PROGRAM_TRANSITIONS[from]?.includes(to) ?? false;
}

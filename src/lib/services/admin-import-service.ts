import "server-only";
import { asDraftPackage, describeImportIssues, fileTaskTitles, parsePackageJson } from "@/lib/admin/program-import";
import { connectToDatabase } from "@/lib/db/mongodb";
import { assertAdmin, type Actor } from "@/lib/services/authorization";
import { importProgramPackage } from "@/lib/services/curriculum-service";
import { fail, type ServiceResult } from "@/lib/services/result";
import { programPackageSchema } from "@/lib/validation/curriculum";
import { ProgramModel } from "@/models/program";

/*
 * Imports a complete program (details, modules and tasks) pasted into the
 * admin dashboard, reusing the same importer as `npm run content:import`.
 *
 * Extra rules for the dashboard:
 * - the program is always saved as a draft (publishing keeps its checklist);
 * - only new programs or existing drafts can be imported, so students never
 *   see published content change underneath them;
 * - file-upload tasks are refused, as in the task form.
 */

/** Form field that receives every problem with the pasted JSON. */
const FIELD = "packageJson";

export type ProgramImportResult = { programId: string; created: boolean; modules: number; tasks: number };

export async function importProgramAsAdmin(actor: Actor, text: string): Promise<ServiceResult<ProgramImportResult>> {
  assertAdmin(actor);

  const json = parsePackageJson(text);
  if (!json.ok) return fail("invalid", "The program was not imported.", { [FIELD]: json.message });

  const parsed = programPackageSchema.safeParse(asDraftPackage(json.value));
  if (!parsed.success) {
    const issues = describeImportIssues(parsed.error);
    return fail("invalid", `The program was not imported: ${parsed.error.issues.length} problem(s) found.`, {
      [FIELD]: issues.join(" · "),
    });
  }

  const fileTasks = fileTaskTitles(parsed.data);
  if (fileTasks.length > 0) {
    return fail("invalid", "The program was not imported.", {
      [FIELD]: `File uploads are not available yet. Change these tasks to "text" or "project_url": ${fileTasks.join(", ")}.`,
    });
  }

  const { slug } = parsed.data.program;
  await connectToDatabase();
  const existing = await ProgramModel.findOne({ slug }).select({ status: 1 }).lean<{ status: string } | null>();
  if (existing && existing.status !== "draft") {
    return fail("conflict", "The program was not imported.", {
      [FIELD]: `A ${existing.status} program already uses the slug "${slug}". Imports only create new programs or replace drafts, so students never see content change underneath them. Use a different slug, or edit that program from its page.`,
    });
  }

  const summary = await importProgramPackage(parsed.data, { actorId: actor.id, via: "admin" });
  return {
    ok: true,
    data: { programId: summary.programId, created: !existing, modules: summary.modules.upserted, tasks: summary.tasks.upserted },
  };
}

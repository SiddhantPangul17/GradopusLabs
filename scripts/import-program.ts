/**
 * Import (or update) a program and its learning content from a JSON file.
 *
 *   npm run content:import -- --file path/to/program.json [--yes]
 *
 * - Validates the whole file first (src/lib/validation/curriculum.ts); nothing
 *   is written if anything is invalid.
 * - Matches the program, modules and tasks by slug and updates them in place,
 *   keeping their ids (students' progress and submissions stay attached).
 * - Modules/tasks missing from the file are unpublished, never deleted.
 * - Public program pages refresh within an hour (cached) or on the next deploy.
 *
 * See docs/learning.md for the file format and docs/examples/sample-program.json.
 */
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { confirmByTyping, fail, loadEnvFiles, parseFlags } from "./cli-helpers";

async function main() {
  loadEnvFiles();
  const flags = parseFlags(process.argv.slice(2), ["file", "yes"]);
  if (typeof flags.file !== "string") fail("Usage: npm run content:import -- --file <program.json> [--yes]");
  if (!process.env.MONGODB_URI) fail("MONGODB_URI is not set (see docs/database-setup.md).");

  let data: unknown;
  try {
    data = JSON.parse(readFileSync(flags.file, "utf8"));
  } catch {
    fail(`Could not read valid JSON from ${flags.file}.`);
  }

  const { programPackageSchema } = await import("@/lib/validation/curriculum");
  const parsed = programPackageSchema.safeParse(data);
  if (!parsed.success) {
    console.error("The file is not valid:");
    for (const issue of parsed.error.issues.slice(0, 20)) console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    process.exit(1);
  }

  const { program, modules } = parsed.data;
  const taskCount = modules.reduce((sum, module) => sum + module.tasks.length, 0);
  console.log(`Program: ${program.title} (${program.slug}), status: ${program.status}`);
  console.log(`Content: ${modules.length} modules, ${taskCount} tasks.`);
  if (flags.yes !== true) await confirmByTyping("Type the program slug to import", program.slug);

  const { importProgramPackage } = await import("@/lib/services/curriculum-service");
  try {
    const summary = await importProgramPackage(parsed.data, { actorId: null, via: "cli" });
    console.log(
      `Done: ${summary.modules.upserted} modules and ${summary.tasks.upserted} tasks saved; ` +
        `${summary.modules.unpublished} modules and ${summary.tasks.unpublished} tasks unpublished (no longer in the file).`,
    );
  } catch (error) {
    if (error instanceof ZodError) fail("The file is not valid.");
    fail("Import failed. Nothing may have been changed for the remaining items; fix the problem and re-run (it is safe to repeat).");
  } finally {
    await mongoose.disconnect();
  }
}

void main();

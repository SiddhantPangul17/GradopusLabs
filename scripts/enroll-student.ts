/**
 * Enroll an existing student in a published program WITHOUT payment.
 *
 *   npm run enroll:student -- --email student@example.com --program program-slug [--yes]
 *
 * For operators only, until online payment exists. The enrollment is recorded
 * as source "manual" with amountPaid 0 (no payment is implied) and audited.
 * Fails safely if the student or program does not exist, or the student is
 * already enrolled. Never prints secrets.
 */
import mongoose from "mongoose";
import { confirmByTyping, fail, loadEnvFiles, parseFlags } from "./cli-helpers";

async function main() {
  loadEnvFiles();
  const flags = parseFlags(process.argv.slice(2), ["email", "program", "yes"]);
  if (typeof flags.email !== "string" || typeof flags.program !== "string") {
    fail("Usage: npm run enroll:student -- --email <student email> --program <program slug> [--yes]");
  }
  if (!process.env.MONGODB_URI) fail("MONGODB_URI is not set (see docs/database-setup.md).");

  const email = flags.email.trim().toLowerCase();
  console.log(`Enroll ${email} in "${flags.program}" (manual enrollment, no payment).`);
  if (flags.yes !== true) await confirmByTyping("Type the student's email to confirm", email);

  const { createManualEnrollment } = await import("@/lib/services/enrollment-service");
  try {
    const result = await createManualEnrollment({ email, programSlug: flags.program }, { actorId: null, via: "cli" });
    if (!result.ok) {
      const reasons = {
        student_not_found: `No active student account found for ${email}. They must register first.`,
        program_not_found: `No published program with slug "${flags.program}".`,
        already_enrolled: `${email} already has a pending or active enrollment in this program.`,
      } as const;
      fail(reasons[result.reason]);
    }
    console.log(`Done: enrollment created. The student can now open it from their dashboard.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(() => fail("Unexpected error. Check the database connection and retry."));

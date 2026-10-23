import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

/* Shared helpers for operator scripts (run with tsx; see package.json). */

/** Loads .env.local then .env without overriding variables already set. */
export function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
}

export function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

export function parseFlags(argv: string[], known: string[]): Record<string, string | true> {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith("--") || !known.includes(arg.slice(2))) fail(`Unknown argument "${arg}".`);
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[name] = next;
      i += 1;
    } else {
      flags[name] = true;
    }
  }
  return flags;
}

/** Asks the operator to type `expected` again; fails when not interactive (use --yes in automation). */
export async function confirmByTyping(prompt: string, expected: string): Promise<void> {
  if (!process.stdin.isTTY) fail("Confirmation required. Re-run in a terminal, or pass --yes.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${prompt} (${expected}): `);
  rl.close();
  if (answer.trim().toLowerCase() !== expected.toLowerCase()) fail("Confirmation did not match. Nothing was changed.");
}

import "server-only";
import argon2 from "argon2";

/*
 * Password hashing with Argon2id (OWASP's first recommendation). Parameters
 * are stored inside each hash, so they can be raised later; needsRehash()
 * lets successful logins upgrade old hashes transparently.
 */

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024, // 64 MiB
  timeCost: 3,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Malformed hash: treat as a failed verification, never as success.
    return false;
  }
}

export function passwordHashNeedsUpgrade(hash: string): boolean {
  return argon2.needsRehash(hash, HASH_OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Performs a real verification against a throwaway hash. Used when the email
 * is unknown so a failed login takes about as long as a wrong password,
 * making it harder to discover which emails have accounts.
 */
export async function verifyAgainstDummyHash(password: string): Promise<void> {
  dummyHash ??= argon2.hash("krushitech-timing-equaliser", HASH_OPTIONS);
  await verifyPassword(await dummyHash, password);
}

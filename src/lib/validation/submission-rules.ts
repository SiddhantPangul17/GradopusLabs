/*
 * Submission field rules shared by the client form (instant feedback) and the
 * server schema in ./submission.ts (authoritative). No dependencies.
 */

export const SUBMISSION_LIMITS = { textMax: 10_000, urlMax: 2_048, noteMax: 1_000 } as const;

export const SUBMISSION_MESSAGES = {
  textRequired: "Write your answer before submitting.",
  textTooLong: `Your answer must be ${SUBMISSION_LIMITS.textMax.toLocaleString("en-IN")} characters or fewer.`,
  urlRequired: "Enter the link to your project.",
  urlInvalid: "Enter a full https:// link to your project, e.g. https://github.com/your-name/project.",
  noteTooLong: `Your note must be ${SUBMISSION_LIMITS.noteMax.toLocaleString("en-IN")} characters or fewer.`,
} as const;

/**
 * Project links must be absolute https:// URLs with a real hostname and no
 * embedded credentials. This rejects javascript:, data:, http:, file: and
 * similar schemes. Links are never fetched by the server.
 */
export function isSafeProjectUrl(value: string): boolean {
  if (value.length > SUBMISSION_LIMITS.urlMax) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname;
  if (!host.includes(".") || host.endsWith(".") || host === "localhost") return false;
  return true;
}

export function checkProjectUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return SUBMISSION_MESSAGES.urlRequired;
  return isSafeProjectUrl(trimmed) ? undefined : SUBMISSION_MESSAGES.urlInvalid;
}

export function checkTextAnswer(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return SUBMISSION_MESSAGES.textRequired;
  if (trimmed.length > SUBMISSION_LIMITS.textMax) return SUBMISSION_MESSAGES.textTooLong;
  return undefined;
}

/**
 * Expected failures raised by server-side services. Route handlers and Server
 * Actions map these to user-facing responses; anything else is treated as an
 * unexpected error and reported generically (never with internal details).
 */
export class ServiceError extends Error {
  constructor(
    readonly code: "not_authorized" | "conflict" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export class NotAuthorizedError extends ServiceError {
  constructor(message = "You are not allowed to perform this action.") {
    super("not_authorized", message);
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string) {
    super("conflict", message);
  }
}

/** MongoDB duplicate-key error (a unique index rejected the write). */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
}

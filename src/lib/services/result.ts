/*
 * Expected outcomes of student-facing service operations. Server Actions show
 * `message` / `fieldErrors`; Route Handlers map `error` to an HTTP status.
 * Unexpected failures are thrown and reported generically.
 */

export type ServiceErrorCode =
  | "invalid"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unavailable";

export type ServiceFailure = {
  ok: false;
  error: ServiceErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
};

export type ServiceResult<T> = { ok: true; data: T } | ServiceFailure;

export const HTTP_STATUS: Record<ServiceErrorCode, number> = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  unavailable: 503,
};

export function fail(error: ServiceErrorCode, message: string, fieldErrors?: Record<string, string>): ServiceFailure {
  return { ok: false, error, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

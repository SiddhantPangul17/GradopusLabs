import "server-only";
import { HTTP_STATUS, type ServiceFailure } from "@/lib/services/result";

/* Small helpers for JSON Route Handlers: consistent, non-leaky responses. */

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function serviceError(failure: ServiceFailure): Response {
  return json(
    { error: failure.error, message: failure.message, ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}) },
    HTTP_STATUS[failure.error],
  );
}

export function unexpectedError(context: string): Response {
  // Log a fixed description only: no request data, ids or stack traces in responses.
  console.error(`[api] ${context} failed unexpectedly`);
  return json({ error: "internal_error", message: "Something went wrong. Please try again later." }, 500);
}

/**
 * Reads a small JSON body. Requires `Content-Type: application/json` (cross-site
 * HTML forms cannot send it, which also protects cookie-authenticated
 * requests from CSRF) and caps the size.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<{ body: unknown } | { response: Response }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { response: json({ error: "unsupported_media_type", message: "Send JSON with Content-Type: application/json." }, 415) };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { response: json({ error: "payload_too_large", message: "The request body is too large." }, 413) };
  }
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { response: json({ error: "invalid", message: "The request body is not valid JSON." }, 400) };
  }
}

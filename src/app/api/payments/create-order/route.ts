import { json, readJsonBody, serviceError, unexpectedError } from "@/lib/api";
import { authorizeApiRequest } from "@/lib/auth/session";
import { createCheckoutOrder } from "@/lib/services/payment-service";

/**
 * POST /api/payments/create-order — start (or resume) checkout for a program.
 * Body: { "programSlug": "…" } and nothing else: price, currency, discounts and
 * the student come from the database and the session, never from the browser.
 * 401 signed out · 403 not an active student · 404 program unavailable ·
 * 409 already enrolled / not open / payment in progress · 429 too many attempts ·
 * 503 payments unavailable · 200 { payment, checkout } (public checkout options only).
 */
export async function POST(request: Request) {
  const { user, response } = await authorizeApiRequest("student");
  if (response) return response;

  const read = await readJsonBody(request, 1024);
  if ("response" in read) return read.response;

  try {
    const result = await createCheckoutOrder({ id: user.id, role: user.role, name: user.name, email: user.email }, read.body);
    return result.ok ? json(result.data) : serviceError(result);
  } catch {
    return unexpectedError("create payment order");
  }
}

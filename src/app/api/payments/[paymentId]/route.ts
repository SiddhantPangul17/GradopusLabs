import { json, readJsonBody, serviceError, unexpectedError } from "@/lib/api";
import { authorizeApiRequest } from "@/lib/auth/session";
import { getPaymentForViewer, reconcilePayment } from "@/lib/services/payment-service";

/**
 * GET /api/payments/:paymentId — a payment's current status, for its student
 * (or an admin). Another student's payment returns 404, like a missing one.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/payments/[paymentId]">) {
  const { user, response } = await authorizeApiRequest();
  if (response) return response;
  try {
    const { paymentId } = await params;
    const payment = await getPaymentForViewer({ id: user.id, role: user.role }, paymentId);
    return payment ? json({ payment }) : json({ error: "not_found", message: "Payment not found." }, 404);
  } catch {
    return unexpectedError("payment status");
  }
}

/**
 * POST /api/payments/:paymentId with { "action": "reconcile" } — ask the
 * provider for the order's current state and apply it with the webhook rules.
 * Changes nothing without provider data; 503 (payment stays pending) if the
 * provider cannot be reached.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/payments/[paymentId]">) {
  const { user, response } = await authorizeApiRequest();
  if (response) return response;

  const read = await readJsonBody(request, 256);
  if ("response" in read) return read.response;
  const body = read.body as { action?: unknown } | null;
  if (!body || typeof body !== "object" || body.action !== "reconcile" || Object.keys(body).length !== 1) {
    return json({ error: "invalid", message: 'Send { "action": "reconcile" }.' }, 400);
  }

  try {
    const { paymentId } = await params;
    const result = await reconcilePayment({ id: user.id, role: user.role }, paymentId);
    return result.ok ? json({ payment: result.data }) : serviceError(result);
  } catch {
    return unexpectedError("payment reconcile");
  }
}

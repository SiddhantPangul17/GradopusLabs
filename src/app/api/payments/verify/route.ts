import { json, readJsonBody, serviceError, unexpectedError } from "@/lib/api";
import { authorizeApiRequest } from "@/lib/auth/session";
import { verifyCheckoutPayment } from "@/lib/services/payment-service";

/**
 * POST /api/payments/verify — the checkout's response, checked on the server.
 * Body: { "paymentId", "providerOrderId", "providerPaymentId", "signature" }.
 * The response says what the SERVER now knows: "paid" only after the signature
 * is valid and the provider confirms capture of the right amount; otherwise
 * "pending" (to be confirmed by webhook) or an error. A status sent by the
 * browser is never accepted.
 */
export async function POST(request: Request) {
  const { user, response } = await authorizeApiRequest("student");
  if (response) return response;

  const read = await readJsonBody(request, 2 * 1024);
  if ("response" in read) return read.response;

  try {
    const result = await verifyCheckoutPayment({ id: user.id, role: user.role }, read.body);
    return result.ok ? json({ payment: result.data }) : serviceError(result);
  } catch {
    return unexpectedError("verify payment");
  }
}

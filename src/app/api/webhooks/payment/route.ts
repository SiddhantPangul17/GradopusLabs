import { json } from "@/lib/api";
import { processPaymentWebhook } from "@/lib/services/payment-service";

/** Provider events are small; anything larger is not a genuine event. */
const MAX_WEBHOOK_BYTES = 256 * 1024;

/**
 * POST /api/webhooks/payment — payment provider webhooks (Razorpay).
 *
 * The signature is checked over the EXACT raw body (read once as text, never
 * re-serialised) with the webhook secret before anything else happens. No
 * session is involved. The handler only updates payment/enrollment records
 * (no emails or other slow work) so it answers well within the provider's
 * 5-second window. 2xx = handled or deliberately ignored (duplicates too);
 * 400 = rejected; 409/5xx = temporary, the provider retries.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BYTES) return json({ error: "payload_too_large" }, 413);

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) return json({ error: "payload_too_large" }, 413);

  try {
    const result = await processPaymentWebhook(rawBody, request.headers);
    return json(result.body, result.status);
  } catch {
    console.error("[payments] webhook failed unexpectedly");
    return json({ error: "processing_failed" }, 500);
  }
}

import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/api";
import { getServerEnv } from "@/lib/env";
import { processEmailOutbox } from "@/lib/email/outbox";

/*
 * Scheduled email outbox processor. Call it every few minutes from a
 * scheduler (e.g. Vercel Cron, which sends `Authorization: Bearer
 * <CRON_SECRET>` with GET, or any external cron with POST). It is the
 * reliable delivery path: emails are also attempted right after each request,
 * but a serverless function may stop before that finishes.
 *
 * 503 when CRON_SECRET is not configured; 401 for a missing or wrong secret.
 * The response contains counts only.
 */

function authorized(request: Request): boolean | null {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) return null;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Compare fixed-length digests in constant time.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return given.length > 0 && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  const ok = authorized(request);
  if (ok === null) return json({ error: "not_configured" }, 503);
  if (!ok) return json({ error: "unauthorized" }, 401);
  try {
    return json(await processEmailOutbox({ limit: 50 }));
  } catch {
    console.error("[email] scheduled processing failed");
    return json({ error: "processing_failed" }, 500);
  }
}

export const GET = handle;
export const POST = handle;

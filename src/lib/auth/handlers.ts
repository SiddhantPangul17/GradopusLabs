import "server-only";
import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { isAuthConfigured } from "@/lib/env";

/** Auth.js route handlers, disabled with a clear 503 when accounts are not configured. */
function notConfigured() {
  return Response.json({ error: "auth_not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

export function GET(request: NextRequest) {
  return isAuthConfigured() ? handlers.GET(request) : notConfigured();
}

export function POST(request: NextRequest) {
  return isAuthConfigured() ? handlers.POST(request) : notConfigured();
}

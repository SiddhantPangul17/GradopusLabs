import { connection } from "next/server";
import { checkDatabaseHealth } from "@/lib/db/mongodb";

/**
 * GET /api/health — minimal liveness and database reachability.
 *
 * Returns only coarse status values: never the connection string, hostnames,
 * database contents or error details (those are logged server-side). Reuses
 * the shared connection, so it does not reconnect on every request.
 */
export async function GET() {
  // Always evaluate at request time; never serve a prerendered status.
  await connection();

  const database = await checkDatabaseHealth();
  // A missing database is acceptable in development (fixtures are used) but not in production.
  const healthy = database === "connected" || (database === "not_configured" && process.env.NODE_ENV !== "production");

  return Response.json(
    { status: healthy ? "ok" : "degraded", database },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

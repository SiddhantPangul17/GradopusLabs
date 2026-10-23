import { json, unexpectedError } from "@/lib/api";
import { authorizeApiRequest } from "@/lib/auth/session";
import { getOperationalStatus } from "@/lib/services/operations-service";

/** GET /api/admin/analytics/operations — operational indicators (admins only; no secrets, hosts or stack traces). */
export async function GET() {
  const { user, response } = await authorizeApiRequest("admin");
  if (response) return response;
  try {
    return json(await getOperationalStatus({ id: user.id, role: user.role }));
  } catch {
    return unexpectedError("operational status");
  }
}

import { authorizeApiRequest } from "@/lib/auth/session";
import { getAdminOverview } from "@/lib/services/admin-service";

/** GET /api/admin/overview — counts for the admin dashboard. 401 if signed out, 403 if not an admin. */
export async function GET() {
  const { user, response } = await authorizeApiRequest("admin");
  if (response) return response;

  const overview = await getAdminOverview({ id: user.id, role: user.role });
  return Response.json(overview, { headers: { "Cache-Control": "no-store" } });
}

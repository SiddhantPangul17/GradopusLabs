import { authorizeApiRequest } from "@/lib/auth/session";

/** GET /api/me — the signed-in user's own safe profile, or 401. Never includes credentials. */
export async function GET() {
  const { user, response } = await authorizeApiRequest();
  if (response) return response;

  return Response.json(
    { user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

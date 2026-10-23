import type { NextRequest } from "next/server";
import { json, unexpectedError } from "@/lib/api";
import { authorizeApiRequest } from "@/lib/auth/session";
import { listOwnSubmissions } from "@/lib/services/submission-service";

/** GET /api/student/submissions?page=N — the signed-in student's own submissions (paginated). */
export async function GET(request: NextRequest) {
  const { user, response } = await authorizeApiRequest("student");
  if (response) return response;
  try {
    const page = Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10);
    return json(await listOwnSubmissions({ id: user.id, role: user.role }, page));
  } catch {
    return unexpectedError("submission list");
  }
}

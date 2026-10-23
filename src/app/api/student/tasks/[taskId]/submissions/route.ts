import type { NextRequest } from "next/server";
import { json, readJsonBody, serviceError, unexpectedError } from "@/lib/api";
import { authorizeApiRequest } from "@/lib/auth/session";
import { submitTaskAttempt } from "@/lib/services/submission-service";

/**
 * POST /api/student/tasks/:taskId/submissions — submit a new attempt.
 * Body: { "submissionType": "text", "textContent": "…" } or
 *       { "submissionType": "project_url", "projectUrl": "https://…" }
 * 401 signed out · 403 not a student / program closed · 404 no access ·
 * 400 invalid · 409 not allowed now (e.g. awaiting review) · 201 created.
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/student/tasks/[taskId]/submissions">) {
  const { user, response } = await authorizeApiRequest("student");
  if (response) return response;

  const read = await readJsonBody(request, 32 * 1024);
  if ("response" in read) return read.response;

  try {
    const { taskId } = await params;
    const result = await submitTaskAttempt({ id: user.id, role: user.role }, taskId, read.body);
    return result.ok ? json(result.data, 201) : serviceError(result);
  } catch {
    return unexpectedError("submission");
  }
}

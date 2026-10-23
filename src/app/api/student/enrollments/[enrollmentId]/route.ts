import { json, serviceError, unexpectedError } from "@/lib/api";
import { authorizeApiRequest } from "@/lib/auth/session";
import { getEnrollmentLearning } from "@/lib/services/learning-service";

/**
 * GET /api/student/enrollments/:enrollmentId — program outline and progress for
 * one of the signed-in student's own enrolments. Another student's enrolment
 * returns 404, exactly like one that does not exist.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/student/enrollments/[enrollmentId]">) {
  const { user, response } = await authorizeApiRequest("student");
  if (response) return response;
  try {
    const { enrollmentId } = await params;
    const result = await getEnrollmentLearning({ id: user.id, role: user.role }, enrollmentId);
    return result.ok ? json(result.data) : serviceError(result);
  } catch {
    return unexpectedError("enrollment");
  }
}

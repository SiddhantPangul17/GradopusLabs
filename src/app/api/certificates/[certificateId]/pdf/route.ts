import { serviceError, unexpectedError } from "@/lib/api";
import { authorizeApiRequest } from "@/lib/auth/session";
import { getCertificatePdf } from "@/lib/services/certificate-service";

/**
 * GET /api/certificates/:certificateId/pdf — the certificate PDF, generated on
 * demand from the stored record. Students: their own valid certificates only
 * (others' look missing: 404). Admins: any certificate (audited). Signed out: 401.
 * Never cached by shared caches.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/certificates/[certificateId]/pdf">) {
  const { user, response } = await authorizeApiRequest();
  if (response) return response;
  try {
    const { certificateId } = await params;
    const result = await getCertificatePdf({ id: user.id, role: user.role }, certificateId);
    if (!result.ok) return serviceError(result);
    return new Response(Buffer.from(result.data.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        // The filename is the certificate number (A-Z, digits, hyphens only).
        "Content-Disposition": `attachment; filename="${result.data.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return unexpectedError("certificate pdf");
  }
}

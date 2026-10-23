import type { Status } from "@/components/ui/status-badge";
import type { CertificateStatus } from "@/lib/constants";

export const certificateStatusDisplay: Record<CertificateStatus, { label: string; status: Status }> = {
  issued: { label: "Valid", status: "success" },
  revoked: { label: "Revoked", status: "error" },
  superseded: { label: "Replaced", status: "warning" },
};

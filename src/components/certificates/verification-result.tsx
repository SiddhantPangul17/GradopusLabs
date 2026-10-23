import Link from "next/link";
import { FactList } from "@/components/ui/fact-list";
import { Notice } from "@/components/ui/notice";
import { formatDate } from "@/lib/learning/labels";
import type { VerificationResult } from "@/lib/services/certificate-service";

/**
 * Shows what the certificate record says right now. Only a stored "issued"
 * record is shown as valid; technical problems are reported as such, never as
 * "invalid" or "not found".
 */
export function VerificationResultView({ result, nameNote }: { result: VerificationResult; nameNote?: string }) {
  switch (result.state) {
    case "valid":
      return (
        <div className="space-y-4">
          <Notice tone="success" title="Valid certificate">
            This certificate is recorded as valid on our system.
          </Notice>
          <FactList
            className="rounded-card border border-border bg-surface p-4"
            items={[
              { label: "Certificate ID", value: result.certificateId },
              { label: "Awarded to", value: result.studentName },
              { label: "Program", value: result.programTitle },
              { label: "Completion date", value: formatDate(result.completionDate) },
              { label: "Issue date", value: formatDate(result.issuedAt) },
            ]}
          />
          {nameNote && <p className="type-supporting text-muted">{nameNote}</p>}
        </div>
      );
    case "revoked":
      return (
        <div className="space-y-4">
          <Notice tone="error" title="Revoked: this certificate is no longer valid">
            This certificate was issued but has since been revoked, so it should not be accepted as evidence of completion.
          </Notice>
          <FactList
            className="rounded-card border border-border bg-surface p-4"
            items={[
              { label: "Certificate ID", value: result.certificateId },
              { label: "Program", value: result.programTitle },
              ...(result.revokedAt ? [{ label: "Revoked on", value: formatDate(result.revokedAt) }] : []),
            ]}
          />
        </div>
      );
    case "superseded":
      return (
        <div className="space-y-4">
          <Notice tone="warning" title="Replaced: this certificate is not current">
            This certificate was replaced by a corrected one and should not be treated as current.
            {result.replacementId && (
              <>
                {" "}
                The replacement is{" "}
                <Link href={`/verify?id=${encodeURIComponent(result.replacementId)}`} className="font-semibold underline underline-offset-2">
                  {result.replacementId}
                </Link>
                .
              </>
            )}
          </Notice>
          <FactList
            className="rounded-card border border-border bg-surface p-4"
            items={[
              { label: "Certificate ID", value: result.certificateId },
              { label: "Program", value: result.programTitle },
              ...(result.supersededAt ? [{ label: "Replaced on", value: formatDate(result.supersededAt) }] : []),
            ]}
          />
        </div>
      );
    case "not_found":
      return (
        <Notice tone="error" title="Certificate not found">
          No certificate matches. Check the ID or link and try again. A certificate that cannot be found here should not be
          treated as verified.
        </Notice>
      );
    case "unavailable":
      return (
        <Notice tone="warning" title="Verification is temporarily unavailable">
          We could not check our records just now. This says nothing about whether the certificate is valid. Please try
          again later.
        </Notice>
      );
  }
}

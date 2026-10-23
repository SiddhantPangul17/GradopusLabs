import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import { certificateStatusDisplay } from "@/lib/certificates/labels";
import { formatDate } from "@/lib/learning/labels";
import { listOwnCertificates } from "@/lib/services/certificate-service";

export const metadata: Metadata = {
  title: "My certificates",
  robots: { index: false },
};

async function Certificates() {
  const user = await requireStudent("/student/certificates");
  const certificates = await listOwnCertificates({ id: user.id, role: user.role });

  return (
    <>
      <SectionHeading
        as="h1"
        title="My certificates"
        description="Certificates are issued by our team after you complete every requirement of a program."
      />
      {certificates.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No certificates yet"
          description="When you complete all the requirements of a program and your certificate is issued, it will appear here."
          action={
            <ButtonLink href="/student/programs" variant="outline">
              Go to my programs
            </ButtonLink>
          }
        />
      ) : (
        <ul className="mt-8 divide-y divide-border rounded-card border border-border">
          {certificates.map((certificate) => {
            const status = certificateStatusDisplay[certificate.status];
            const href = `/student/certificates/${encodeURIComponent(certificate.certificateId)}`;
            return (
              <li key={certificate.certificateId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="type-label wrap-anywhere text-foreground">
                    <Link href={href} className="text-primary underline-offset-4 hover:underline">
                      {certificate.programTitle}
                    </Link>
                  </p>
                  <p className="type-meta mt-1 text-muted">
                    <span className="font-mono">{certificate.certificateId}</span> · issued{" "}
                    <time dateTime={certificate.issuedAt}>{formatDate(certificate.issuedAt)}</time>
                    {certificate.replacedBy && <> · replaced by {certificate.replacedBy}</>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={status.status}>{status.label}</StatusBadge>
                  {certificate.status === "issued" && (
                    <a
                      href={`/api/certificates/${encodeURIComponent(certificate.certificateId)}/pdf`}
                      className="type-supporting font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      Download PDF<span className="sr-only"> for {certificate.programTitle}</span>
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function CertificatesPage() {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <Certificates />
    </Suspense>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { buttonStyles } from "@/components/ui/button";
import { FactList } from "@/components/ui/fact-list";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";
import { certificateStatusDisplay } from "@/lib/certificates/labels";
import { formatDate } from "@/lib/learning/labels";
import { getOwnCertificate } from "@/lib/services/certificate-service";

export const metadata: Metadata = {
  title: "Certificate",
  robots: { index: false },
};

async function Certificate({ params }: { params: PageProps<"/student/certificates/[certificateId]">["params"] }) {
  const { certificateId } = await params;
  const user = await requireStudent(`/student/certificates/${encodeURIComponent(certificateId)}`);
  // Ownership is part of the query: another student's certificate looks like a missing one.
  const certificate = await getOwnCertificate({ id: user.id, role: user.role }, decodeURIComponent(certificateId));
  if (!certificate) notFound();
  const status = certificateStatusDisplay[certificate.status];

  return (
    <>
      <nav aria-label="Breadcrumb" className="type-supporting text-muted">
        <Link href="/student/certificates" className="rounded-control hover:text-foreground hover:underline">
          My certificates
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page" className="font-mono font-medium text-foreground">
          {certificate.certificateId}
        </span>
      </nav>
      <header className="mt-4 max-w-3xl">
        <h1 className="type-page-title wrap-anywhere text-foreground">{certificate.programTitle}</h1>
        <StatusBadge status={status.status} className="mt-3">
          {status.label}
        </StatusBadge>
      </header>

      <div className="mt-6 max-w-3xl space-y-6">
        {certificate.status === "revoked" && (
          <Notice tone="error" title="This certificate has been revoked">
            It is no longer valid and verification shows it as revoked. If you think this is a mistake, please{" "}
            <Link href="/contact" className="font-semibold underline underline-offset-2">
              contact us
            </Link>{" "}
            with the certificate ID.
          </Notice>
        )}
        {certificate.status === "superseded" && (
          <Notice tone="warning" title="This certificate has been replaced">
            A corrected certificate was issued
            {certificate.replacedBy ? (
              <>
                {" "}
                (
                <Link
                  href={`/student/certificates/${encodeURIComponent(certificate.replacedBy)}`}
                  className="font-semibold underline underline-offset-2"
                >
                  {certificate.replacedBy}
                </Link>
                )
              </>
            ) : null}
            . This one is kept for your records but is no longer current; use the replacement instead.
          </Notice>
        )}

        <FactList
          className="rounded-card border border-border bg-surface p-4"
          items={[
            { label: "Certificate ID", value: certificate.certificateId },
            { label: "Name on certificate", value: certificate.studentName },
            { label: "Completion date", value: formatDate(certificate.completionDate) },
            { label: "Issue date", value: formatDate(certificate.issuedAt) },
            ...(certificate.replaces ? [{ label: "Replaces", value: certificate.replaces }] : []),
          ]}
        />

        {certificate.status === "issued" && (
          <>
            <div className="flex flex-wrap gap-3">
              {/* A plain link: the PDF is a file download, not a page. */}
              <a href={`/api/certificates/${encodeURIComponent(certificate.certificateId)}/pdf`} className={buttonStyles()}>
                Download PDF
              </a>
            </div>
            {certificate.verificationUrl ? (
              <section aria-labelledby="share-heading" className="rounded-card border border-border p-4">
                <h2 id="share-heading" className="type-label text-foreground">
                  Verification link
                </h2>
                <p className="type-supporting mt-1 text-muted">
                  This is the link in your certificate&apos;s QR code. Anyone with it can see your name, the program and the
                  certificate status. Share it only with people you want to verify your certificate.
                </p>
                <p className="mt-3 break-all font-mono text-sm">
                  <a href={certificate.verificationUrl} className="text-primary underline-offset-4 hover:underline">
                    {certificate.verificationUrl}
                  </a>
                </p>
              </section>
            ) : (
              <Notice tone="info" title="Verification link unavailable">
                The verification link cannot be shown at the moment. Anyone can still check the certificate ID on the{" "}
                <Link href="/verify" className="font-semibold underline underline-offset-2">
                  verification page
                </Link>
                .
              </Notice>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function CertificatePage({ params }: PageProps<"/student/certificates/[certificateId]">) {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <Certificate params={params} />
    </Suspense>
  );
}

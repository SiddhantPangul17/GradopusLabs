import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReplaceCertificateForm, RevokeCertificateForm } from "@/components/admin/certificate-forms";
import { AdminHeader, AdminLoading } from "@/components/admin/admin-page";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FactList } from "@/components/ui/fact-list";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { replaceCertificateAction, revokeCertificateAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/auth/session";
import { certificateStatusDisplay } from "@/lib/certificates/labels";
import { formatDate, formatDateTime } from "@/lib/learning/labels";
import { getCertificateForAdmin } from "@/lib/services/certificate-service";

export const metadata: Metadata = { title: "Certificate · Admin", robots: { index: false } };

type Props = PageProps<"/admin/certificates/[certificateId]">;

async function Detail({ params, searchParams }: Props) {
  const [{ certificateId }, query] = await Promise.all([params, searchParams]);
  const admin = await requireAdmin(`/admin/certificates/${encodeURIComponent(certificateId)}`);
  const certificate = await getCertificateForAdmin({ id: admin.id, role: admin.role }, decodeURIComponent(certificateId));
  if (!certificate) notFound();
  const status = certificateStatusDisplay[certificate.status];
  const link = (id: string) => (
    <Link href={`/admin/certificates/${encodeURIComponent(id)}`} className="font-mono font-semibold text-primary underline-offset-4 hover:underline">
      {id}
    </Link>
  );

  return (
    <>
      <AdminHeader
        title={certificate.certificateId}
        breadcrumb={[{ label: "Certificates", href: "/admin/certificates" }]}
        description={
          <StatusBadge status={status.status} className="mt-1">
            {status.label}
          </StatusBadge>
        }
        actions={
          <a href={`/api/certificates/${encodeURIComponent(certificate.certificateId)}/pdf`} className={buttonStyles({ variant: "outline" })}>
            {certificate.status === "issued" ? "Download PDF" : "Download PDF (watermarked)"}
          </a>
        }
      />
      {query.issued === "1" && <Notice tone="success" title="Certificate issued" className="mb-6" />}
      {query.revoked === "1" && (
        <Notice tone="success" title="Certificate revoked" className="mb-6">
          Public verification now shows it as revoked.
        </Notice>
      )}
      {query.replaced === "1" && <Notice tone="success" title="Replacement issued; the previous certificate is now superseded" className="mb-6" />}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="record-heading" className="space-y-4">
          <h2 id="record-heading" className="type-section-title text-foreground">
            Record
          </h2>
          <FactList
            className="rounded-card border border-border bg-surface p-4"
            items={[
              { label: "Name (as printed)", value: certificate.studentName },
              { label: "Program (as printed)", value: certificate.programTitle },
              { label: "Completion date", value: formatDate(certificate.completionDate) },
              { label: "Issued", value: `${formatDateTime(certificate.issuedAt)} by ${certificate.issuedBy}` },
              { label: "Student account", value: `${certificate.student.name} (${certificate.student.email})` },
              { label: "Template", value: `v${certificate.templateVersion}` },
            ]}
          />
          {(certificate.replaces || certificate.replacedBy) && (
            <p className="type-supporting text-foreground">
              {certificate.replaces && <>Replaces {link(certificate.replaces)}. </>}
              {certificate.replacedBy && <>Replaced by {link(certificate.replacedBy)}.</>}
            </p>
          )}
          {certificate.correctionReason && (
            <p className="type-supporting text-foreground">
              <span className="font-semibold">Correction reason:</span> {certificate.correctionReason}
            </p>
          )}
          {certificate.status === "revoked" && (
            <Notice tone="error" title={`Revoked ${certificate.revokedAt ? formatDateTime(certificate.revokedAt) : ""} by ${certificate.revokedBy ?? "unknown"}`}>
              Reason (internal): {certificate.revocationReason}
            </Notice>
          )}
          {certificate.verificationUrl && (
            <p className="type-supporting break-all text-muted">
              Verification link:{" "}
              <a href={certificate.verificationUrl} className="font-mono text-primary underline-offset-4 hover:underline">
                {certificate.verificationUrl}
              </a>
            </p>
          )}
        </section>

        {certificate.status === "issued" && (
          <div className="space-y-6">
            <Card as="section" aria-labelledby="replace-heading">
              <CardTitle as="h2" id="replace-heading">
                Correct and reissue
              </CardTitle>
              <p className="type-supporting mt-2 text-muted">
                For errors such as a misspelled name: fix the student&apos;s profile name (or the program title) first. The
                replacement gets a new number and verification link; this one stays on record as superseded.
              </p>
              <div className="mt-4">
                <ReplaceCertificateForm action={replaceCertificateAction.bind(null, certificate.certificateId)} />
              </div>
            </Card>
            <Card as="section" aria-labelledby="revoke-heading">
              <CardTitle as="h2" id="revoke-heading">
                Revoke
              </CardTitle>
              <p className="type-supporting mt-2 text-muted">
                Only with documented grounds (for example, falsified or plagiarised work). The record is kept and
                verification shows &ldquo;revoked&rdquo;.
              </p>
              <div className="mt-4">
                <RevokeCertificateForm action={revokeCertificateAction.bind(null, certificate.certificateId)} />
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

export default function AdminCertificatePage(props: Props) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Detail {...props} />
    </Suspense>
  );
}

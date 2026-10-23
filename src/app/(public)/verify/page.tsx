import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { VerificationResultView } from "@/components/certificates/verification-result";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { brand } from "@/config/brand";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { getClientIp } from "@/lib/auth/request";
import { normalizeCertificateId } from "@/lib/certificates/ids";
import { canonical } from "@/lib/seo";
import { verifyCertificateById, type VerificationResult } from "@/lib/services/certificate-service";

export function generateMetadata(): Metadata {
  return {
    title: "Verify Certificate",
    description: `Check the recorded status of a ${brand.name} certificate using its certificate ID or QR code.`,
    ...canonical("/verify"),
  };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function Lookup({ searchParams }: { searchParams: PageProps<"/verify">["searchParams"] }) {
  const raw = (first((await searchParams).id) ?? "").slice(0, 60);
  if (!raw.trim()) return null;
  const id = normalizeCertificateId(raw);

  let result: VerificationResult;
  if (!id) {
    return (
      <Notice tone="error" title="That is not a certificate ID" className="mt-8">
        Certificate IDs look like {brand.certificate.prefix}-2026-000001. Check the ID printed on the certificate.
      </Notice>
    );
  }
  let retryAfterSeconds = 0;
  // Always a live, per-request lookup (never prerendered or prefetched): validity must come from the database now.
  await connection();
  try {
    const limit = await consumeRateLimit(RATE_LIMITS.certificateVerifyPerIp, getClientIp(await headers()));
    if (limit.allowed) result = await verifyCertificateById(id);
    else {
      retryAfterSeconds = limit.retryAfterSeconds;
      result = { state: "unavailable" };
    }
  } catch {
    result = { state: "unavailable" };
  }
  if (retryAfterSeconds > 0) {
    return (
      <Notice tone="warning" title="Too many checks" className="mt-8">
        Please wait {Math.ceil(retryAfterSeconds / 60)} minute(s) and try again.
      </Notice>
    );
  }
  return (
    <section aria-labelledby="result-heading" className="mt-8">
      <h2 id="result-heading" className="type-section-title mb-4 text-foreground">
        Result for {id}
      </h2>
      <VerificationResultView
        result={result}
        nameNote="Only initials are shown when searching by ID. Scan the QR code on the certificate (or open its verification link) to see the full name."
      />
    </section>
  );
}

export default function VerifyPage({ searchParams }: PageProps<"/verify">) {
  return (
    <PageContainer size="narrow" className="py-10 sm:py-14">
      <h1 className="type-page-title text-foreground">Verify a certificate</h1>
      <p className="type-lead mt-4 text-muted">
        Enter the certificate ID printed on a {brand.name} certificate, or scan its QR code, to see its current status on
        our records.
      </p>
      {/* A plain GET form: works without JavaScript, and the result URL can be shared. */}
      <form method="get" action="/verify" className="mt-8 space-y-4">
        <TextField
          id="verify-id"
          name="id"
          label="Certificate ID"
          hint={`For example ${brand.certificate.prefix}-2026-000001`}
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          required
        />
        <Button type="submit">
          Check certificate
        </Button>
      </form>
      <Suspense fallback={<p className="type-supporting mt-8 text-muted">Checking…</p>}>
        <Lookup searchParams={searchParams} />
      </Suspense>
      <p className="type-supporting mt-10 text-muted">
        A QR code or printed document is only a link to our records: the status shown here is what counts. Read the{" "}
        <Link href="/certificate-policy" className="font-semibold text-primary underline-offset-4 hover:underline">
          certificate policy
        </Link>
        .
      </p>
    </PageContainer>
  );
}

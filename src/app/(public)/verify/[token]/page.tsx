import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { VerificationResultView } from "@/components/certificates/verification-result";
import { PageContainer } from "@/components/layout/page-container";
import { brand } from "@/config/brand";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { getClientIp } from "@/lib/auth/request";
import { verifyCertificateByToken, type VerificationResult } from "@/lib/services/certificate-service";

/*
 * Target of the QR code. The token in the URL is a secret held by the
 * certificate owner: results are rendered per request (never cached), the
 * page is not indexed, and the URL is not sent to other sites as a referrer.
 */
export const metadata: Metadata = {
  title: "Certificate verification",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function Result({ params }: { params: PageProps<"/verify/[token]">["params"] }) {
  const { token } = await params;
  let result: VerificationResult;
  let retryAfterSeconds = 0;
  // Always a live, per-request lookup (never prerendered or prefetched): validity must come from the database now.
  await connection();
  try {
    const limit = await consumeRateLimit(RATE_LIMITS.certificateVerifyPerIp, getClientIp(await headers()));
    if (limit.allowed) result = await verifyCertificateByToken(token);
    else {
      retryAfterSeconds = limit.retryAfterSeconds;
      result = { state: "unavailable" };
    }
  } catch {
    result = { state: "unavailable" };
  }
  if (retryAfterSeconds > 0) {
    return (
      <p role="status" className="type-body text-foreground">
        Too many checks from your network. Please wait {Math.ceil(retryAfterSeconds / 60)} minute(s) and try again.
      </p>
    );
  }
  return <VerificationResultView result={result} />;
}

export default function VerifyTokenPage({ params }: PageProps<"/verify/[token]">) {
  return (
    <PageContainer size="narrow" className="py-10 sm:py-14">
      <h1 className="type-page-title text-foreground">Certificate verification</h1>
      <p className="type-lead mt-4 text-muted">The current status of this {brand.name} certificate on our records.</p>
      <div className="mt-8">
        <Suspense fallback={<p className="type-supporting text-muted">Checking our records…</p>}>
          <Result params={params} />
        </Suspense>
      </div>
      <p className="type-supporting mt-10 text-muted">
        You can also{" "}
        <Link href="/verify" className="font-semibold text-primary underline-offset-4 hover:underline">
          check a certificate by its ID
        </Link>
        . Read the{" "}
        <Link href="/certificate-policy" className="font-semibold text-primary underline-offset-4 hover:underline">
          certificate policy
        </Link>
        .
      </p>
    </PageContainer>
  );
}

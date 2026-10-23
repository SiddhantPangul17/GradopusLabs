import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthFormFallback, AuthShell, AuthUnavailable } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Notice } from "@/components/ui/notice";
import { isAuthConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false },
  // The reset token is in the URL: never send it to other sites in the Referer header.
  referrer: "no-referrer",
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

async function ResetContent({ searchParams }: { searchParams: PageProps<"/reset-password">["searchParams"] }) {
  if (!isAuthConfigured()) return <AuthUnavailable />;

  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token || !TOKEN_PATTERN.test(token)) {
    return (
      <Notice tone="error" title="This reset link is invalid">
        The link is incomplete or has expired.{" "}
        <Link href="/forgot-password" className="font-semibold underline">
          Request a new link
        </Link>
        .
      </Notice>
    );
  }
  // The token is checked (hash, expiry, single use) when the form is submitted.
  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <AuthShell
      title="Choose a new password"
      description="Setting a new password signs you out on all devices."
    >
      <Suspense fallback={<AuthFormFallback />}>
        <ResetContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

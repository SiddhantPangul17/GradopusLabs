import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthFormFallback, AuthShell, AuthUnavailable } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { Notice } from "@/components/ui/notice";
import { homePathForRole } from "@/lib/auth/redirects";
import { getCurrentUser } from "@/lib/auth/session";
import { brand } from "@/config/brand";
import { isAuthConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Create an account",
  description: `Create a free ${brand.name} student account.`,
  robots: { index: false },
};

async function RegisterContent() {
  if (!isAuthConfigured()) return <AuthUnavailable />;
  const user = await getCurrentUser();
  if (user) redirect(homePathForRole(user.role));
  return <RegisterForm />;
}

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create a student account"
      description="Register to enrol in programs once enrolment opens."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary underline underline-offset-4">
            Log in
          </Link>
        </p>
      }
    >
      <Notice title="Before you register" className="mb-6">
        Please read the{" "}
        <Link href="/terms" className="font-semibold underline underline-offset-2">
          Student Terms &amp; Conditions
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className="font-semibold underline underline-offset-2">
          Privacy Policy
        </Link>{" "}
        before creating an account.
      </Notice>
      <Suspense fallback={<AuthFormFallback />}>
        <RegisterContent />
      </Suspense>
    </AuthShell>
  );
}

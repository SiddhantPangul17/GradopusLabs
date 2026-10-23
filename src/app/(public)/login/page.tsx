import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthFormFallback, AuthShell, AuthUnavailable } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Notice } from "@/components/ui/notice";
import { getSafeRedirectPath, homePathForRole } from "@/lib/auth/redirects";
import { getCurrentUser } from "@/lib/auth/session";
import { brand } from "@/config/brand";
import { isAuthConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Log in",
  description: `Log in to your ${brand.name} student or admin account.`,
  robots: { index: false },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  if (!isAuthConfigured()) return <AuthUnavailable />;

  // Already signed in: go straight to the right dashboard.
  const user = await getCurrentUser();
  if (user) redirect(homePathForRole(user.role));

  const params = await searchParams;
  const callbackUrl = getSafeRedirectPath(first(params.callbackUrl)) ?? "";

  let notice = null;
  if (first(params.registered) === "1") {
    notice = (
      <Notice tone="success" title="Account created">
        Your student account is ready. Log in to continue.
      </Notice>
    );
  } else if (first(params.reset) === "1") {
    notice = (
      <Notice tone="success" title="Password updated">
        Your password was changed and you were signed out everywhere. Log in with your new password.
      </Notice>
    );
  } else if (first(params.password) === "changed") {
    notice = (
      <Notice tone="success" title="Password changed">
        You were signed out everywhere. Log in with your new password.
      </Notice>
    );
  } else if (first(params.error)) {
    // Set by Auth.js when a sign-in fails outside this form; kept deliberately generic.
    notice = (
      <Notice tone="error" title="Could not log in">
        Please check your details and try again.
      </Notice>
    );
  }

  return <LoginForm callbackUrl={callbackUrl} notice={notice} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell
      title="Log in"
      description="Students and administrators log in here."
      footer={
        <p>
          New to {brand.name}?{" "}
          <Link href="/register" className="font-semibold text-primary underline underline-offset-4">
            Create a student account
          </Link>
        </p>
      }
    >
      <Suspense fallback={<AuthFormFallback />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

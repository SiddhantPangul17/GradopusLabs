import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Notice } from "@/components/ui/notice";
import { isEmailDeliveryConfigured } from "@/lib/email";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      description="Enter the email address for your account and we will send you a link to reset your password."
      footer={
        <p>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-primary underline underline-offset-4">
            Back to log in
          </Link>
        </p>
      }
    >
      {!isEmailDeliveryConfigured() && (
        <Notice tone="warning" title="Password reset emails are not available yet" className="mb-6">
          Email delivery has not been set up on this site, so reset links cannot be sent at the moment.
        </Notice>
      )}
      <ForgotPasswordForm />
    </AuthShell>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { ChangePasswordForm, ProfileNameForm } from "@/components/student/profile-forms";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FactList } from "@/components/ui/fact-list";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStudent } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false },
};

async function Profile() {
  const user = await requireStudent("/student/profile");
  return (
    <>
      <SectionHeading as="h1" title="Your profile" description="Manage your name and password." />
      <div className="mt-8 grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="details-heading">
          <CardHeader>
            <CardTitle as="h2" id="details-heading">
              Personal details
            </CardTitle>
          </CardHeader>
          <div className="mt-5">
            <ProfileNameForm name={user.name} />
          </div>
        </Card>

        <Card as="section" aria-labelledby="account-heading">
          <CardHeader>
            <CardTitle as="h2" id="account-heading">
              Account
            </CardTitle>
            <CardDescription>These details cannot be changed here.</CardDescription>
          </CardHeader>
          <FactList className="mt-4" items={[{ label: "Email address", value: user.email }]} />
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status="success">Student account</StatusBadge>
            <StatusBadge status="neutral">{user.emailVerified ? "Email verified" : "Email not verified"}</StatusBadge>
          </div>
          <p className="type-supporting mt-3 text-muted">
            Changing your email address needs email verification, which is not available yet. Contact us if you need to
            change it.
          </p>
        </Card>

        <Card as="section" aria-labelledby="password-heading" className="lg:col-span-2 lg:max-w-xl">
          <CardHeader>
            <CardTitle as="h2" id="password-heading">
              Change password
            </CardTitle>
          </CardHeader>
          <div className="mt-5">
            <ChangePasswordForm />
          </div>
        </Card>
      </div>
    </>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <Profile />
    </Suspense>
  );
}

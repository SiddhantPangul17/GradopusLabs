import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormFallback } from "@/components/auth/auth-shell";
import { EnrollmentCard } from "@/components/student/enrollment-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { requireStudent } from "@/lib/auth/session";
import { listStudentEnrollments } from "@/lib/services/learning-service";

export const metadata: Metadata = {
  title: "My programs",
  robots: { index: false },
};

async function MyPrograms() {
  const user = await requireStudent("/student/programs");
  const enrollments = await listStudentEnrollments({ id: user.id, role: user.role });

  return (
    <>
      <SectionHeading
        as="h1"
        title="My programs"
        description="Every program you are enrolled in, including pending, completed and cancelled enrollments."
      />
      {enrollments.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="You are not enrolled in any programs yet"
          description="Online enrollment is not available yet. Once you are enrolled, your programs will appear here."
          action={
            <ButtonLink href="/programs" variant="outline">
              Browse programs
            </ButtonLink>
          }
        />
      ) : (
        <ul className="mt-8 grid gap-6 md:grid-cols-2">
          {enrollments.map((enrollment) => (
            <li key={enrollment.id}>
              <EnrollmentCard enrollment={enrollment} headingLevel="h2" />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function MyProgramsPage() {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <MyPrograms />
    </Suspense>
  );
}

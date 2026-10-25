import { Suspense, type ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { StudentNav, StudentNavView } from "@/components/student/student-nav";
import { getCurrentUser } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/lib/services/notification-service";

/** Adds the unread-notification count for the signed-in student (display only). */
async function StudentNavWithCount() {
  const user = await getCurrentUser();
  let unread = 0;
  if (user?.role === "student") {
    try {
      unread = await countUnreadNotifications({ id: user.id, role: user.role });
    } catch {
      // The badge is a convenience; the page itself still loads.
    }
  }
  return <StudentNav unread={unread} />;
}

/**
 * Student area shell (inside the public header/footer). Layouts do not re-run
 * on every navigation, so authorization is NOT done here: every student page,
 * Server Action and API calls requireStudent()/its own check.
 */
export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    // Tinted backdrop with a soft brand glow at the top, so white cards stand out from the page.
    <div className="relative isolate h-full bg-surface">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-linear-to-b from-secondary/80 via-secondary/30 to-transparent" />
      <PageContainer className="pt-6 pb-12 sm:pb-16">
        {/* The active-link state and unread count are per request, so they stream in; the links render immediately. */}
        <Suspense fallback={<StudentNavView pathname={null} />}>
          <StudentNavWithCount />
        </Suspense>
        <div className="pt-8">{children}</div>
      </PageContainer>
    </div>
  );
}

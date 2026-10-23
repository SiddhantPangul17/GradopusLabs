import { Suspense, type ReactNode } from "react";
import { AnalyticsNav, AnalyticsNavView } from "@/components/analytics/analytics-nav";

/** Report tabs (navigation only; every analytics page and API authorizes itself). */
export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<AnalyticsNavView pathname={null} search="" />}>
        <AnalyticsNav />
      </Suspense>
      {children}
    </>
  );
}

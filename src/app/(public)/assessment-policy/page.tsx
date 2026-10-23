import type { Metadata } from "next";
import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export function generateMetadata(): Metadata {
  return policyMetadata("project-assessment-policy");
}

export default function AssessmentPolicyPage() {
  return <PolicyPage slug="project-assessment-policy" />;
}

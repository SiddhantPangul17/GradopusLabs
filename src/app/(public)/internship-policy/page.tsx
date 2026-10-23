import type { Metadata } from "next";
import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export function generateMetadata(): Metadata {
  return policyMetadata("internship-policy");
}

export default function InternshipPolicyPage() {
  return <PolicyPage slug="internship-policy" />;
}

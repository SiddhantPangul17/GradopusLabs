import type { Metadata } from "next";
import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export function generateMetadata(): Metadata {
  return policyMetadata("intellectual-property-code-of-conduct");
}

export default function IntellectualPropertyPage() {
  return <PolicyPage slug="intellectual-property-code-of-conduct" />;
}

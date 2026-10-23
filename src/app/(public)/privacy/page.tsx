import type { Metadata } from "next";
import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export function generateMetadata(): Metadata {
  return policyMetadata("privacy-policy");
}

export default function PrivacyPage() {
  return <PolicyPage slug="privacy-policy" />;
}

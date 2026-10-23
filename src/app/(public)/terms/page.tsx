import type { Metadata } from "next";
import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export function generateMetadata(): Metadata {
  return policyMetadata("terms-and-conditions");
}

export default function TermsPage() {
  return <PolicyPage slug="terms-and-conditions" />;
}

import type { Metadata } from "next";
import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export function generateMetadata(): Metadata {
  return policyMetadata("certificate-policy");
}

export default function CertificatePolicyPage() {
  return <PolicyPage slug="certificate-policy" />;
}

import type { Metadata } from "next";
import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export function generateMetadata(): Metadata {
  return policyMetadata("payment-refund-policy");
}

export default function RefundPolicyPage() {
  return <PolicyPage slug="payment-refund-policy" />;
}

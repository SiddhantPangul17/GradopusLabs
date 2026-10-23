import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/forms/contact-form";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { brand } from "@/config/brand";
import { isEmailDeliveryConfigured } from "@/lib/email/config";
import { canonical } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return {
    title: "Contact",
    description: `Contact ${brand.name} with questions about programs, certificates or the platform.`,
    ...canonical("/contact"),
  };
}

export default function ContactPage() {
  // Only real, configured contact details are shown (see brand.ts).
  const { email } = brand.contact;
  const deliveryReady = Boolean(email) && isEmailDeliveryConfigured();

  return (
    <PageContainer className="py-12 sm:py-16 lg:py-20">
      <header className="max-w-2xl">
        <p className="type-eyebrow text-primary">Contact</p>
        <h1 className="type-page-title mt-2 text-foreground">Get in touch</h1>
        <p className="type-lead mt-4 text-muted">
          Have a question about a program, a certificate or the platform? Send us a message using the form below.
        </p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
        <Card as="section" aria-labelledby="form-heading" className="sm:p-8">
          <h2 id="form-heading" className="type-card-title text-foreground">
            Send a message
          </h2>
          {deliveryReady ? (
            <p className="type-supporting mt-2 mb-6 text-muted">
              Your message is emailed to our support team, and we reply to the email address you give. Messages are not
              stored on this website.
            </p>
          ) : (
            <Notice tone="warning" title="Message delivery is not connected yet" className="mt-4 mb-6">
              You can fill in and check the form, but messages are not sent or stored yet.
              {email && <> Please email us at {email} instead.</>}
            </Notice>
          )}
          <ContactForm />
        </Card>

        <aside className="space-y-6">
          <Card as="section" aria-labelledby="other-heading" className="bg-surface">
            <CardTitle as="h2" id="other-heading">
              Other ways to reach us
            </CardTitle>
            {email ? (
              <p className="type-supporting mt-2 text-muted">
                Email:{" "}
                <a href={`mailto:${email}`} className="font-semibold text-primary underline underline-offset-4">
                  {email}
                </a>
              </p>
            ) : (
              <p className="type-supporting mt-2 text-muted">
                Other contact details have not been published yet. They will be listed here once available.
              </p>
            )}
          </Card>
          <Card as="section" aria-labelledby="help-heading" className="bg-surface">
            <CardTitle as="h2" id="help-heading">
              Looking for a quick answer?
            </CardTitle>
            <p className="type-supporting mt-2 text-muted">
              Many questions about programs, tasks and certificates are answered in the{" "}
              <Link href="/faq" className="font-semibold text-primary underline underline-offset-4">
                FAQs
              </Link>
              .
            </p>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}

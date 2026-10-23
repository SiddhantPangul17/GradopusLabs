"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { submitContactMessage } from "@/app/(public)/contact/actions";
import { Button } from "@/components/ui/button";
import { TextareaField, TextField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { brand } from "@/config/brand";
import { contactLimits, type ContactFormState } from "@/lib/contact-form";

const initialState: ContactFormState = { status: "idle" };
const supportEmail = brand.contact.email;

function ResultNotice({ state }: { state: ContactFormState }) {
  switch (state.status) {
    case "invalid": {
      const count = Object.keys(state.errors).length;
      return (
        <Notice tone="error" title="Please check the form">
          {count === 1 ? "One field needs" : `${count} fields need`} your attention. Each problem is described below
          the field.
        </Notice>
      );
    }
    case "not-connected":
      return (
        <Notice tone="warning" title="Your message was not sent">
          Your details look correct, but message delivery is not connected yet, so nothing was sent or saved. Your
          message is still in the form below if you want to copy it. Please check the{" "}
          <Link href="/faq" className="font-semibold underline underline-offset-2">
            FAQs
          </Link>{" "}
          in the meantime.
        </Notice>
      );
    case "rate-limited":
      return (
        <Notice tone="warning" title="Too many messages">
          Several messages were sent from your network recently, so this one was not sent. Please try again in an
          hour{supportEmail && <>, or email us at {supportEmail}</>}. Your message is still in the form below.
        </Notice>
      );
    case "sent":
      return <Notice tone="success" title="Message sent">Thank you. We will reply to the email address you provided.</Notice>;
    case "error":
      return (
        <Notice tone="error" title="Something went wrong">
          Your message could not be sent. Please try again later
          {supportEmail && <>, or email us at {supportEmail}</>}. Your message is still in the form below.
        </Notice>
      );
    default:
      return null;
  }
}

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContactMessage, initialState);
  const resultRef = useRef<HTMLDivElement>(null);

  // Move focus to the result so keyboard and screen-reader users hear the outcome.
  useEffect(() => {
    if (state.status !== "idle") resultRef.current?.focus();
  }, [state]);

  const values = "values" in state ? state.values : undefined;
  const errors = state.status === "invalid" ? state.errors : {};
  // Remount fields after each response so they show the values returned by the server.
  const formKey = JSON.stringify(values ?? {});

  return (
    <form action={formAction} noValidate className="space-y-5">
      {/* scroll-mt keeps the focused result clear of the sticky header. */}
      <div ref={resultRef} tabIndex={-1} className="scroll-mt-24 rounded-card empty:hidden focus:outline-none">
        <ResultNotice state={state} />
      </div>

      <div key={formKey} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="contact-name"
            name="name"
            label="Your name"
            autoComplete="name"
            required
            maxLength={contactLimits.name}
            defaultValue={values?.name}
            error={errors.name}
          />
          <TextField
            id="contact-email"
            name="email"
            type="email"
            label="Email address"
            autoComplete="email"
            required
            maxLength={contactLimits.email}
            defaultValue={values?.email}
            error={errors.email}
          />
        </div>
        <TextField
          id="contact-subject"
          name="subject"
          label="Subject"
          required
          maxLength={contactLimits.subject}
          defaultValue={values?.subject}
          error={errors.subject}
        />
        <TextareaField
          id="contact-message"
          name="message"
          label="Message"
          hint={`At least ${contactLimits.messageMin} characters.`}
          rows={6}
          required
          maxLength={contactLimits.message}
          defaultValue={values?.message}
          error={errors.message}
        />
      </div>

      {/* Honeypot for spam bots: hidden from people and assistive tech, never focusable. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Leave this field empty</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <Button type="submit" size="lg" loading={pending} loadingText="Checking…" className="w-full sm:w-auto">
        Send message
      </Button>
    </form>
  );
}

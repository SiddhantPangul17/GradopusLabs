/**
 * Central brand configuration.
 *
 * Every user-facing brand value (name, copy, contact details, logo, colours,
 * certificate prefix, pricing defaults) lives here so a rebrand only touches
 * this file and the logo asset in /public.
 *
 * This module is safe to import from both Server and Client Components: it
 * contains no secrets and reads no environment variables. The site URL is
 * environment-specific and is resolved server-side in `@/lib/env`.
 */
export const brand = {
  name: "GradOpus Labs",
  description: "Affordable Virtual Project-Based Training",
  summary:
    "GradOpus Labs offers affordable online training programs where students build skills by completing practical projects.",

  locale: "en-IN",
  timeZone: "Asia/Kolkata",

  logo: {
    src: "/images/logo.svg",
    alt: "GradOpus Labs logo",
  },

  contact: {
    // Public support inbox (contact page, policies, email footers). Business
    // address only: the proprietor's personal name and contact details are
    // deliberately not published.
    email: "support.gradopuslabs@gmail.com" as string | null,
  },

  certificate: {
    // Certificate numbers are `${prefix}-${year}-${sequence}`, e.g. GOL-2026-000001.
    // 2-6 capital letters. Changing it affects only certificates issued afterwards
    // (certificates issued earlier under "KT" or "GL" keep their numbers and still verify).
    prefix: "GOL",
    // Printed on certificates ONLY when a real, authorised person is configured
    // here, e.g. { name: "…", role: "Proprietor, GradOpus Labs" }. Never invent one.
    signatory: null as { name: string; role: string } | null,
  },

  commerce: {
    currency: "INR",
    // Stored in the smallest currency unit (paise) to avoid floating-point
    // rounding. 9900 paise = ₹99.
    defaultProgramPricePaise: 9900,
  },

  // Injected as --brand-* CSS variables by the root layout and mapped to
  // Tailwind colour utilities in globals.css (e.g. primaryStrong ->
  // bg-primary-strong). These values are the single source of truth for colour.
  // Text/background pairs used by components meet WCAG AA contrast.
  theme: {
    colors: {
      primary: "#4338ca", // indigo: buttons, links, accents (logo background)
      primaryStrong: "#3730a3", // deep indigo: hover/pressed
      onPrimary: "#ffffff", // text on primary/destructive fills
      secondary: "#e0e7ff", // pale indigo: soft fills, highlights
      secondaryForeground: "#312e81", // text on secondary
      accent: "#f59e0b", // amber (the logo's spark): decorative highlights only, never for text on white
      background: "#ffffff", // main background
      surface: "#f8fafc", // secondary background
      foreground: "#0f172a", // primary text
      muted: "#64748b", // secondary text
      border: "#e2e8f0", // dividers, card borders
      borderStrong: "#7c8a9e", // form-control borders (3:1 against white)
      focusRing: "#4338ca",
      success: "#15803d",
      info: "#0369a1", // pending / in-progress states (sky blue, distinct from the indigo primary)
      warning: "#b45309",
      error: "#b91c1c",
    },
  },
} as const;

export type Brand = typeof brand;

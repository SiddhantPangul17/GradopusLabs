import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { CSSProperties } from "react";
import { RevealObserver } from "@/components/layout/reveal-observer";
import { SkipLink } from "@/components/layout/skip-link";
import { brand } from "@/config/brand";
import { getSiteUrl } from "@/lib/env";
import "./globals.css";

// Self-hosted at build time by next/font: visitors' browsers make no requests to Google.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Defaults for every route. Pages override `title` (filled into the template),
// `description`, `robots`, etc. by exporting their own `metadata`.
export function generateMetadata(): Metadata {
  return {
    metadataBase: getSiteUrl(),
    title: {
      default: `${brand.name} | ${brand.description}`,
      template: `%s | ${brand.name}`,
    },
    description: brand.summary,
    applicationName: brand.name,
    icons: { icon: brand.logo.src },
    openGraph: {
      siteName: brand.name,
      type: "website",
      locale: brand.locale.replace("-", "_"),
    },
  };
}

export const viewport: Viewport = {
  themeColor: brand.theme.colors.primary,
};

// Maps brand.theme.colors (camelCase) to --brand-* CSS variables consumed by
// globals.css, e.g. primaryStrong -> --brand-primary-strong.
const brandCssVariables = Object.fromEntries(
  Object.entries(brand.theme.colors).map(([name, value]) => [
    `--brand-${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`,
    value,
  ]),
) as CSSProperties;

/**
 * Document shell shared by every area of the site. The public header/footer
 * live in app/(public)/layout.tsx, so areas such as /admin can use their own
 * chrome while staying in the same application and domain. Each area's layout
 * must render a <main id="main"> for the skip link.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" style={brandCssVariables} className={inter.variable}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <SkipLink />
        <RevealObserver />
        {children}
      </body>
    </html>
  );
}

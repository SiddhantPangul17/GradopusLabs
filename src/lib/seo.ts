import "server-only";
import type { Metadata } from "next";
import { isSiteUrlConfigured } from "@/lib/env";

/**
 * Canonical URL metadata for a path. Returned only when SITE_URL is
 * configured, so local and preview builds never advertise a localhost or
 * guessed domain as canonical. The path is resolved against metadataBase.
 */
export function canonical(path: string): Pick<Metadata, "alternates"> {
  return isSiteUrlConfigured() ? { alternates: { canonical: path } } : {};
}

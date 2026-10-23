import { cacheLife } from "next/cache";
import { brand } from "@/config/brand";

/**
 * The current year in the brand's time zone. Cached so the page can still be
 * prerendered; the value refreshes hourly, so it rolls over shortly after New Year.
 */
export async function CurrentYear() {
  "use cache";
  cacheLife("hours");

  return new Intl.DateTimeFormat(brand.locale, { year: "numeric", timeZone: brand.timeZone }).format(new Date());
}

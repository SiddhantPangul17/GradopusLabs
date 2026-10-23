import { brand } from "@/config/brand";

/** Joins class names, skipping falsy values. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Formats an amount stored in the smallest currency unit (e.g. paise) for
 * display. Whole amounts are shown without decimals: 9900 -> "₹99".
 */
export function formatMinorUnits(
  amount: number,
  currency: string = brand.commerce.currency,
): string {
  const major = amount / 100;
  return new Intl.NumberFormat(brand.locale, {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
  }).format(major);
}

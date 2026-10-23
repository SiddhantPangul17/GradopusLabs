import { policies } from "@/config/policies";
import type { NavGroup, NavItem } from "@/types";

/** Primary links shown in the site header (desktop and mobile). */
export const primaryNavigation: readonly NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Programs", href: "/programs" },
  { label: "Verify Certificate", href: "/verify" },
];

export const loginLink: NavItem = { label: "Log in", href: "/login" };
export const registerLink: NavItem = { label: "Register", href: "/register" };

export const footerNavigation: readonly NavGroup[] = [
  {
    title: "Platform",
    items: [
      ...primaryNavigation,
      { label: "About", href: "/about" },
      { label: "FAQs", href: "/faq" },
      loginLink,
      registerLink,
    ],
  },
  {
    title: "Support and policies",
    items: [{ label: "Contact", href: "/contact" }, ...policies.map(({ navLabel, href }) => ({ label: navLabel, href }))],
  },
];

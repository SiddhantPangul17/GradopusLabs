"use client";

import type { MouseEvent } from "react";

/**
 * "Skip to main content". Next.js keeps recently visited pages mounted but
 * hidden, so several <main id="main"> elements can exist after navigating
 * between layouts; this moves focus to the visible one. Without JavaScript,
 * the plain #main link still works.
 */
export function SkipLink() {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const main = Array.from(document.querySelectorAll<HTMLElement>("main")).find((element) =>
      element.checkVisibility(),
    );
    if (!main) return;
    event.preventDefault();
    main.setAttribute("tabindex", "-1");
    main.focus();
    main.scrollIntoView();
  }

  return (
    <a
      href="#main"
      onClick={handleClick}
      className="sr-only rounded-control bg-primary px-4 py-2 type-button text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
    >
      Skip to main content
    </a>
  );
}

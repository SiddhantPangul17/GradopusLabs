"use client";

import { useEffect } from "react";

/** Longest reveal: 600ms animation + 420ms maximum stagger delay (see globals.css). */
const REVEAL_MS = 1100;

/**
 * Drives the `data-reveal` scroll animations defined in globals.css. Renders
 * nothing. Elements already on screen when they first appear are marked
 * "instant" (no animation, so the first paint never flickers); the rest fade
 * in as they scroll into view. A MutationObserver picks up content added by
 * client-side navigation. Skipped entirely for reduced-motion users.
 */
export function RevealObserver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const timers = new Set<number>();

    const intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          intersection.unobserve(element);
          element.dataset.revealed = "in";
          // Mark finished so the animation does not replay when Next.js re-shows a cached page.
          const timer = window.setTimeout(() => {
            element.dataset.revealed = "done";
            timers.delete(timer);
          }, REVEAL_MS);
          timers.add(timer);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    function track(element: HTMLElement, initial: boolean) {
      if (element.dataset.revealed) return;
      if (initial && element.getBoundingClientRect().top < window.innerHeight) {
        element.dataset.revealed = "instant";
        return;
      }
      intersection.observe(element);
    }

    function scan(node: ParentNode, initial: boolean) {
      if (node instanceof HTMLElement && node.hasAttribute("data-reveal")) track(node, initial);
      node.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => track(element, initial));
    }

    // Mark what is already visible before enabling the hidden state, in the same frame.
    scan(document, true);
    root.dataset.revealReady = "";

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) scan(node, false);
        });
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      intersection.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      delete root.dataset.revealReady;
    };
  }, []);

  return null;
}

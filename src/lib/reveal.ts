/*
 * Props for scroll-reveal elements (globals.css, <RevealObserver>). Spread one
 * of these instead of writing `data-reveal` by hand.
 *
 * RevealObserver sets `data-revealed` on these elements as soon as they are in
 * the DOM. Content that streams in can be marked before React hydrates it, so
 * that attribute is an intentional server/client difference. The warning is
 * suppressed for this element only: React does not apply it to children, so
 * real mismatches inside still surface.
 */

/** Fades the element up as it enters the viewport. */
export const reveal = { "data-reveal": true, suppressHydrationWarning: true } as const;

/** Fades the element's children up one after another. */
export const revealStagger = { "data-reveal": "stagger", suppressHydrationWarning: true } as const;

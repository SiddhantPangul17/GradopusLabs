"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Container for a form's result message. Receives focus whenever `focusKey`
 * changes (i.e. after each submission) so screen-reader and keyboard users
 * hear the outcome; scroll-mt keeps it clear of the sticky header.
 */
export function FormStatus({ focusKey, children }: { focusKey: unknown; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusKey) ref.current?.focus();
  }, [focusKey]);

  return (
    <div ref={ref} tabIndex={-1} className="scroll-mt-24 rounded-card empty:hidden focus:outline-none">
      {children}
    </div>
  );
}

/** Focuses the first field with an error, in DOM order. */
export function focusFirstInvalid(form: HTMLFormElement, fields: readonly string[]) {
  for (const name of fields) {
    const element = form.elements.namedItem(name);
    if (element instanceof HTMLElement) {
      element.focus();
      return;
    }
  }
}

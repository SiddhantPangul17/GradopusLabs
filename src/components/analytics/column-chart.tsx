"use client";

import { useId, useState } from "react";
import { cn, formatMinorUnits } from "@/lib/utils";

/*
 * Single-series column chart for values over time (one series → one colour,
 * no legend; the heading names it). Columns are ≤ 24px with a 4px rounded top
 * and square baseline, separated by a 2px gap; hairline solid gridlines;
 * clean, compact y-ticks; only the highest column is labelled directly.
 * Each column is focusable and shows a tooltip on hover and focus. Every value
 * is also in the data table below, so nothing depends on hovering or colour.
 */

export type ColumnPoint = { key: string; label: string; value: number };
export type ValueFormat = { kind: "count" } | { kind: "money"; currency: string };

function format(value: number, as: ValueFormat): string {
  return as.kind === "money" ? formatMinorUnits(value, as.currency) : new Intl.NumberFormat("en-IN").format(value);
}

function compact(value: number, as: ValueFormat): string {
  const major = as.kind === "money" ? value / 100 : value;
  const text = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(major);
  return as.kind === "money" ? `${as.currency === "INR" ? "₹" : `${as.currency} `}${text}` : text;
}

/** A "nice" axis maximum: 1, 2, 2.5 or 5 × 10^n at or above the data maximum. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map((step) => step * magnitude).find((candidate) => candidate >= max) ?? max;
}

export function ColumnChart({ points, valueFormat, summary, tableCaption }: { points: ColumnPoint[]; valueFormat: ValueFormat; summary: string; tableCaption: string }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) return <p className="type-supporting text-muted">No data in this period.</p>;

  const max = Math.max(...points.map((point) => point.value));
  const top = niceMax(max);
  const peak = max > 0 ? points.findIndex((point) => point.value === max) : -1;
  const ticks = [top, top / 2, 0];
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  // Labels and tooltips near an edge extend inwards, so nothing spills past the chart (or the screen).
  const edge = (index: number) => (index < points.length / 3 ? "left-0" : index >= (points.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2");

  return (
    <figure className="m-0 min-w-0">
      <figcaption className="type-supporting text-muted">{summary}</figcaption>
      <div className="mt-4 flex gap-2">
        {/* y-axis ticks */}
        <div className="flex h-48 flex-col justify-between text-right type-meta tabular-nums text-muted" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {compact(tick, valueFormat)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* hairline gridlines */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-48" aria-hidden="true">
            {[0, 50, 100].map((position) => (
              <div key={position} className="absolute inset-x-0 border-t border-border" style={{ top: `${position}%` }} />
            ))}
          </div>
          <ol className="relative flex h-48 items-end gap-[2px]" aria-label={tableCaption}>
            {points.map((point, index) => {
              const height = top > 0 ? (point.value / top) * 100 : 0;
              const text = `${point.label}: ${format(point.value, valueFormat)}`;
              return (
                <li key={point.key} className="flex h-full min-w-0 flex-1 items-end justify-center">
                  {/* The label and tooltip anchor to the bar itself (≤ 24px), not to the cell. */}
                  <div className="relative flex h-full w-full max-w-6 items-end justify-center">
                    {index === peak && (
                      <span
                        className={cn("pointer-events-none absolute mb-1 whitespace-nowrap type-meta font-semibold text-foreground", edge(index))}
                        style={{ bottom: `${height}%` }}
                      >
                        {compact(point.value, valueFormat)}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={text}
                      aria-describedby={active === index ? `${id}-tip` : undefined}
                      onPointerEnter={() => setActive(index)}
                      onPointerLeave={() => setActive((current) => (current === index ? null : current))}
                      onFocus={() => setActive(index)}
                      onBlur={() => setActive(null)}
                      className="flex h-full w-full cursor-default items-end justify-center rounded-t-sm focus-visible:outline-2"
                    >
                      <span
                        className={cn(
                          "block w-full origin-bottom animate-grow-y rounded-t-sm bg-primary transition-opacity",
                          active !== null && active !== index && "opacity-60",
                        )}
                        style={{ height: `${height}%`, minHeight: point.value > 0 ? 2 : 0, animationDelay: `${Math.min(index * 15, 450)}ms` }}
                      />
                    </button>
                    {active === index && (
                      <span
                        id={`${id}-tip`}
                        role="tooltip"
                        className={cn(
                          "pointer-events-none absolute z-10 mb-2 animate-fade-up-sm whitespace-nowrap rounded-control border border-border bg-background px-2.5 py-1.5 shadow-raised",
                          edge(index),
                        )}
                        style={{ bottom: `${Math.min(height, 70)}%` }}
                      >
                        <span className="block type-label text-foreground">{format(point.value, valueFormat)}</span>
                        <span className="block type-meta text-muted">{point.label}</span>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {/* x-axis: sparse labels */}
          <div className="mt-1 flex gap-[2px] border-t border-border-strong pt-1" aria-hidden="true">
            {points.map((point, index) => (
              <span
                key={point.key}
                className={cn(
                  "flex min-w-0 flex-1 whitespace-nowrap type-meta text-muted",
                  points.length === 1 ? "justify-center" : index === 0 ? "justify-start" : index === points.length - 1 ? "justify-end" : "justify-center",
                )}
              >
                {index % labelEvery === 0 || index === points.length - 1 ? point.label.replace("Week of ", "") : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer type-supporting font-semibold text-primary">Show data table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-card border border-border">
          <table className="w-full text-left type-supporting">
            <caption className="sr-only">{tableCaption}</caption>
            <thead className="bg-surface">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Period</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Value</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.key} className="border-t border-border">
                  <td className="px-3 py-1.5">{point.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{format(point.value, valueFormat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

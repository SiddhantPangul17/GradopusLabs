/*
 * CSV for report exports (RFC 4180 quoting). Text cells that a spreadsheet
 * would treat as a formula (= + - @, tab, carriage return) are prefixed with
 * an apostrophe, so a program title like "=HYPERLINK(...)" stays plain text.
 * Numbers are written as numbers.
 */

export type CsvValue = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n']/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  // BOM so spreadsheet apps read UTF-8 (₹, accented names) correctly.
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

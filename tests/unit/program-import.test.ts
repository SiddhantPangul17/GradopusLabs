import { describe, expect, it } from "vitest";
import { asDraftPackage, describeImportIssues, fileTaskTitles, MAX_IMPORT_CHARS, parsePackageJson } from "@/lib/admin/program-import";
import { programPackageSchema } from "@/lib/validation/curriculum";

describe("parsePackageJson", () => {
  it("parses JSON, ignoring surrounding whitespace and a byte-order mark", () => {
    expect(parsePackageJson('﻿  {"a": 1}\n')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("explains empty, broken and oversized input", () => {
    expect(parsePackageJson("   ")).toMatchObject({ ok: false, message: expect.stringContaining("Paste") });
    expect(parsePackageJson('{"a": 1')).toMatchObject({ ok: false, message: expect.stringContaining("not valid JSON") });
    expect(parsePackageJson(`"${"x".repeat(MAX_IMPORT_CHARS)}"`)).toMatchObject({ ok: false, message: expect.stringContaining("too large") });
  });
});

describe("asDraftPackage", () => {
  it("forces the program status to draft, whatever the file says", () => {
    const input = { program: { slug: "p", status: "published" }, modules: [] };
    expect(asDraftPackage(input)).toEqual({ program: { slug: "p", status: "draft" }, modules: [] });
    expect(input.program.status).toBe("published"); // input is not mutated
  });

  it("leaves non-package values for the schema to reject", () => {
    expect(asDraftPackage([1, 2])).toEqual([1, 2]);
    expect(asDraftPackage({ program: "x" })).toEqual({ program: "x" });
  });
});

describe("fileTaskTitles", () => {
  it("lists file-upload tasks across modules", () => {
    const pkg = {
      modules: [
        { tasks: [{ title: "Essay", taskType: "text" }, { title: "Screenshot", taskType: "file" }] },
        { tasks: [{ title: "Deck", taskType: "file" }] },
      ],
    };
    expect(fileTaskTitles(pkg)).toEqual(["Screenshot", "Deck"]);
  });
});

describe("describeImportIssues", () => {
  it("names modules and tasks by position, counting from 1", () => {
    const result = programPackageSchema.safeParse({
      program: { title: "" },
      modules: [{ slug: "m", title: "M", tasks: [{ slug: "t", title: "T", taskType: "video" }] }],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issues = describeImportIssues(result.error);
    expect(issues.some((issue) => issue.startsWith("Program details, title:"))).toBe(true);
    expect(issues.some((issue) => issue.startsWith("Module 1, task 1, taskType:"))).toBe(true);
  });

  it("caps the list and says how many more there are", () => {
    const result = programPackageSchema.safeParse({ program: {}, modules: Array.from({ length: 15 }, () => ({})) });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issues = describeImportIssues(result.error);
    expect(result.error.issues.length).toBeGreaterThan(12);
    expect(issues).toHaveLength(13);
    expect(issues.at(-1)).toMatch(/^…and \d+ more\.$/);
  });
});

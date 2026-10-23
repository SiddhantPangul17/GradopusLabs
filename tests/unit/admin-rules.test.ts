import { describe, expect, it } from "vitest";
import {
  formFieldErrors,
  istLocalToIso,
  isoToIstLocal,
  lines,
  paiseToRupees,
  parseTitledLines,
  rupeesToPaise,
  slugify,
} from "@/lib/admin/form-parsing";
import { canChangeProgramStatus, publishProblems, type ReadinessInput } from "@/lib/admin/readiness";
import { adminReviewSchema, manualEnrollmentSchema, studentStatusChangeSchema, taskFormSchema } from "@/lib/validation/admin";

describe("price conversion (exact integer paise)", () => {
  it.each([
    ["99", 9900],
    ["99.5", 9950],
    ["99.50", 9950],
    ["19.99", 1999],
    ["0.29", 29], // 0.29 * 100 = 28.999… in floating point
    ["1,499", 149900],
    ["₹ 250", 25000],
    ["0", 0],
  ])("%s → %d paise", (input, paise) => {
    expect(rupeesToPaise(input)).toBe(paise);
  });

  it.each(["-5", "99.999", "abc", "", "1e3", "12.3.4", " . "])("rejects %j", (input) => {
    expect(rupeesToPaise(input)).toBeNull();
  });

  it("round-trips for editing", () => {
    for (const paise of [0, 29, 1999, 9900, 9950, 149900]) expect(rupeesToPaise(paiseToRupees(paise))).toBe(paise);
    expect(paiseToRupees(9950)).toBe("99.50");
  });
});

describe("form helpers", () => {
  it("normalises slugs consistently", () => {
    expect(slugify("  Web Dev 101: The Basics! ")).toBe("web-dev-101-the-basics");
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
    expect(slugify("---")).toBe("");
    expect(slugify("a".repeat(150)).length).toBeLessThanOrEqual(100);
  });

  it("parses one-per-line and titled lines", () => {
    expect(lines(" a \n\n b\r\n")).toEqual(["a", "b"]);
    expect(parseTitledLines("HTML: tags; forms\nJust a title")).toEqual([
      { title: "HTML", detail: "tags; forms" },
      { title: "Just a title", detail: "" },
    ]);
  });

  it("interprets datetime-local values as IST", () => {
    expect(istLocalToIso("2026-11-01T10:30")).toBe("2026-11-01T05:00:00.000Z");
    expect(istLocalToIso("")).toBeUndefined();
    expect(istLocalToIso("tomorrow")).toBeNull();
    expect(isoToIstLocal(new Date("2026-11-01T05:00:00.000Z"))).toBe("2026-11-01T10:30");
  });

  it("maps nested schema paths to form fields", () => {
    const parsed = adminReviewSchema.safeParse({ status: "rejected", feedback: "", score: null });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(formFieldErrors(parsed.error)).toHaveProperty("feedback");
  });
});

describe("publishing checklist and status transitions", () => {
  const ready: ReadinessInput = {
    program: { learningOutcomes: ["Outcome"], completionCriteria: ["Criterion"] },
    modules: [{ id: "m1", title: "Intro", isPublished: true, content: "Read me" }],
    tasks: [{ moduleId: "m1", title: "Task", isPublished: true, required: true, taskType: "text", instructions: "Do it", description: "" }],
    fileStorageConfigured: false,
  };

  it("passes a complete program", () => {
    expect(publishProblems(ready)).toEqual([]);
  });

  it("reports each missing requirement", () => {
    expect(publishProblems({ ...ready, program: { learningOutcomes: [], completionCriteria: [] } })).toHaveLength(2);
    expect(publishProblems({ ...ready, modules: [{ ...ready.modules[0]!, isPublished: false }] })).toContain("Publish at least one learning module.");
    expect(publishProblems({ ...ready, tasks: [{ ...ready.tasks[0]!, taskType: "file" }] }).join()).toMatch(/file submissions are not available/);
    expect(publishProblems({ ...ready, tasks: [{ ...ready.tasks[0]!, instructions: "" }] }).join()).toMatch(/needs instructions/);
    expect(publishProblems({ ...ready, modules: [{ ...ready.modules[0]!, content: " " }], tasks: [] }).join()).toMatch(/no content and no published tasks/);
  });

  it("only allows defined status changes", () => {
    expect(canChangeProgramStatus("draft", "published")).toBe(true);
    expect(canChangeProgramStatus("published", "archived")).toBe(true);
    expect(canChangeProgramStatus("archived", "published")).toBe(true);
    expect(canChangeProgramStatus("draft", "draft")).toBe(false);
    expect(canChangeProgramStatus("published", "deleted")).toBe(false);
  });
});

describe("admin input schemas", () => {
  const task = {
    title: "T",
    slug: "t",
    description: "",
    instructions: "",
    taskType: "text",
    required: true,
    completionRule: "review",
    dueDate: null,
    evaluationCriteria: [],
    isPublished: true,
  };

  it("rejects file tasks (no secure storage) and unknown fields", () => {
    expect(taskFormSchema.safeParse(task).success).toBe(true);
    expect(taskFormSchema.safeParse({ ...task, taskType: "file" }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...task, html: "<script>" }).success).toBe(false);
  });

  it("requires feedback for changes requested and rejection; bounds scores", () => {
    expect(adminReviewSchema.safeParse({ status: "accepted", feedback: "", score: null }).success).toBe(true);
    expect(adminReviewSchema.safeParse({ status: "changes_requested", feedback: "short", score: null }).success).toBe(false);
    expect(adminReviewSchema.safeParse({ status: "rejected", feedback: "Plagiarised from an online tutorial.", score: null }).success).toBe(true);
    expect(adminReviewSchema.safeParse({ status: "accepted", feedback: "", score: 101 }).success).toBe(false);
    expect(adminReviewSchema.safeParse({ status: "submitted", feedback: "", score: null }).success).toBe(false);
    expect(adminReviewSchema.safeParse({ status: "accepted", feedback: "", score: null, reviewerId: "x" }).success).toBe(false);
  });

  it("needs a reason and confirmation for suspensions; confirmation for manual enrolments", () => {
    expect(studentStatusChangeSchema.safeParse({ status: "suspended", reason: "Abuse of the review system", confirm: true }).success).toBe(true);
    expect(studentStatusChangeSchema.safeParse({ status: "suspended", reason: "x", confirm: true }).success).toBe(false);
    expect(studentStatusChangeSchema.safeParse({ status: "suspended", reason: "Valid reason", confirm: false }).success).toBe(false);
    expect(studentStatusChangeSchema.safeParse({ status: "deleted", reason: "Valid reason", confirm: true }).success).toBe(false);
    expect(manualEnrollmentSchema.safeParse({ email: "a@b.co", programSlug: "x", confirmNoPayment: false }).success).toBe(false);
  });
});

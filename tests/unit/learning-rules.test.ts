import { describe, expect, it } from "vitest";
import { evaluateProgress, taskStateFor, type ProgressSubmission, type ProgressTask } from "@/lib/learning/progress";
import { canSubmitAttempt, canTransition, learningAccess } from "@/lib/learning/rules";
import { programPackageSchema } from "@/lib/validation/curriculum";
import { reviewInputSchema, submissionInputSchema } from "@/lib/validation/submission";
import { isSafeProjectUrl } from "@/lib/validation/submission-rules";
import { programInput } from "../helpers";

const modules = [
  { id: "m1", order: 0 }, // reading only
  { id: "m2", order: 1 }, // t1 (review, required), t2 (submission, required), t3 optional
  { id: "m3", order: 2 }, // t4 (review, required)
];
const tasks: ProgressTask[] = [
  { id: "t1", moduleId: "m2", required: true, completionRule: "review" },
  { id: "t2", moduleId: "m2", required: true, completionRule: "submission" },
  { id: "t3", moduleId: "m2", required: false, completionRule: "submission" },
  { id: "t4", moduleId: "m3", required: true, completionRule: "review" },
];
const sub = (taskId: string, status: ProgressSubmission["status"], attempt = 1): ProgressSubmission => ({ taskId, status, attempt });
const evaluate = (submissions: ProgressSubmission[], read: string[] = []) =>
  evaluateProgress({ modules, tasks, submissions, readModuleIds: read });

describe("task state", () => {
  it.each([
    ["review", [], "not_started"],
    ["review", [sub("t", "submitted")], "awaiting_review"],
    ["review", [sub("t", "under_review")], "awaiting_review"],
    ["review", [sub("t", "accepted")], "completed"],
    ["submission", [sub("t", "submitted")], "completed"],
    ["submission", [sub("t", "rejected")], "rejected"],
    ["review", [sub("t", "changes_requested", 1), sub("t", "submitted", 2)], "awaiting_review"],
    ["review", [sub("t", "accepted", 1), sub("t", "changes_requested", 2)], "changes_requested"],
  ] as const)("rule %s with %j → %s", (rule, attempts, expected) => {
    expect(taskStateFor({ completionRule: rule }, attempts)).toBe(expected);
  });
});

describe("program progress (single rule, deterministic)", () => {
  it("nothing done: not started, 0%, next is first module", () => {
    const result = evaluate([]);
    expect(result).toMatchObject({ state: "not_started", percent: 0, completedModules: 0, totalModules: 3, nextModuleId: "m1" });
    expect(result.eligibleForCertificate).toBe(false);
  });

  it("reading module counts only when marked read; optional tasks never count", () => {
    expect(evaluate([sub("t3", "submitted")]).completedModules).toBe(0);
    const result = evaluate([], ["m1"]);
    expect(result).toMatchObject({ completedModules: 1, percent: 33, state: "in_progress", nextModuleId: "m2" });
  });

  it("a review task is not complete until accepted", () => {
    const pending = evaluate([sub("t1", "submitted"), sub("t2", "submitted")], ["m1"]);
    expect(pending.modules.find((m) => m.id === "m2")).toMatchObject({ complete: false, requiredCompleted: 1, awaitingReview: 1 });
    const accepted = evaluate([sub("t1", "accepted"), sub("t2", "submitted")], ["m1"]);
    expect(accepted.modules.find((m) => m.id === "m2")?.complete).toBe(true);
    expect(accepted.percent).toBe(66);
  });

  it("awaiting review when only reviews remain; eligible only when everything is complete", () => {
    const waiting = evaluate([sub("t1", "submitted"), sub("t2", "submitted"), sub("t4", "under_review")], ["m1"]);
    expect(waiting.state).toBe("awaiting_review");
    expect(waiting.eligibleForCertificate).toBe(false);

    const done = evaluate([sub("t1", "accepted"), sub("t2", "submitted"), sub("t4", "accepted")], ["m1"]);
    expect(done).toMatchObject({ state: "requirements_completed", percent: 100, nextModuleId: null, eligibleForCertificate: true });
  });

  it("a rejected 'submission' task reopens the module", () => {
    const result = evaluate([sub("t1", "accepted"), sub("t2", "rejected"), sub("t4", "accepted")], ["m1"]);
    expect(result.state).toBe("in_progress");
    expect(result.eligibleForCertificate).toBe(false);
  });

  it("no published modules: no content, never eligible", () => {
    const result = evaluateProgress({ modules: [], tasks: [], submissions: [], readModuleIds: [] });
    expect(result).toMatchObject({ state: "no_content", percent: 0, eligibleForCertificate: false });
  });

  it("ignores tasks of modules that are not in the published list", () => {
    const result = evaluateProgress({
      modules: [{ id: "m1", order: 0 }],
      tasks: [{ id: "hidden", moduleId: "draft", required: true, completionRule: "review" }],
      submissions: [],
      readModuleIds: ["m1"],
    });
    expect(result).toMatchObject({ state: "requirements_completed", taskStates: {} });
  });

  it("is order-independent and repeatable", () => {
    const submissions = [sub("t1", "accepted"), sub("t2", "submitted")];
    const a = evaluate(submissions, ["m1"]);
    const b = evaluate([...submissions].reverse(), ["m1"]);
    expect(a).toEqual(b);
  });
});

describe("access, transitions and resubmission", () => {
  it("enrollment + program status decide access", () => {
    expect(learningAccess("active", "published")).toBe("full");
    expect(learningAccess("active", "archived")).toBe("full");
    expect(learningAccess("completed", "published")).toBe("read_only");
    expect(learningAccess("pending", "published")).toBe("none");
    expect(learningAccess("cancelled", "published")).toBe("none");
    expect(learningAccess("active", "draft")).toBe("none");
  });

  it("only valid review transitions are allowed", () => {
    expect(canTransition("submitted", "accepted")).toBe(true);
    expect(canTransition("under_review", "changes_requested")).toBe(true);
    expect(canTransition("accepted", "rejected")).toBe(false);
    expect(canTransition("rejected", "accepted")).toBe(false);
    expect(canTransition("changes_requested", "accepted")).toBe(false);
  });

  it("resubmission policy", () => {
    expect(canSubmitAttempt("review", undefined).allowed).toBe(true);
    expect(canSubmitAttempt("review", { attempt: 1, status: "submitted" }).allowed).toBe(false);
    expect(canSubmitAttempt("submission", { attempt: 1, status: "submitted" }).allowed).toBe(true);
    expect(canSubmitAttempt("review", { attempt: 1, status: "under_review" }).allowed).toBe(false);
    expect(canSubmitAttempt("review", { attempt: 1, status: "changes_requested" }).allowed).toBe(true);
    expect(canSubmitAttempt("review", { attempt: 2, status: "rejected" }).allowed).toBe(true);
    expect(canSubmitAttempt("submission", { attempt: 1, status: "accepted" }).allowed).toBe(false);
    expect(canSubmitAttempt("submission", { attempt: 10, status: "changes_requested" }).allowed).toBe(false);
  });
});

describe("submission validation", () => {
  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://example.com",
    "ftp://example.com/file",
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "https://localhost/app",
    "https://intranet/app",
    "//example.com",
    "example.com",
    `https://example.com/${"a".repeat(2100)}`,
  ])("rejects unsafe or invalid project URL %s", (url) => {
    expect(isSafeProjectUrl(url)).toBe(false);
    expect(submissionInputSchema.safeParse({ submissionType: "project_url", projectUrl: url }).success).toBe(false);
  });

  it("accepts normal https project links", () => {
    for (const url of ["https://github.com/asha/portfolio", "https://asha.github.io/site/?x=1#top", "https://example.co.in"]) {
      expect(submissionInputSchema.safeParse({ submissionType: "project_url", projectUrl: url }).success).toBe(true);
    }
  });

  it("rejects empty, oversized and mismatched text answers", () => {
    expect(submissionInputSchema.safeParse({ submissionType: "text", textContent: "   " }).success).toBe(false);
    expect(submissionInputSchema.safeParse({ submissionType: "text", textContent: "x".repeat(10_001) }).success).toBe(false);
    expect(submissionInputSchema.safeParse({ submissionType: "text", projectUrl: "https://example.com" }).success).toBe(false);
    expect(submissionInputSchema.safeParse({ submissionType: "file" }).success).toBe(false);
  });

  it.each([{ status: "accepted" }, { score: 100 }, { feedback: "great" }, { reviewerId: "x" }, { attempt: 1 }])(
    "students cannot send reviewer fields: %j",
    (extra) => {
      expect(submissionInputSchema.safeParse({ submissionType: "text", textContent: "My answer", ...extra }).success).toBe(false);
    },
  );

  it("reviews cannot reset a submission to 'submitted' and scores are bounded", () => {
    expect(reviewInputSchema.safeParse({ status: "submitted" }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ status: "accepted", score: 101 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ status: "accepted", score: 90, feedback: "Good" }).success).toBe(true);
  });
});

describe("curriculum package validation", () => {
  const base = { program: programInput(), modules: [] };
  const task = { slug: "t", title: "T", taskType: "text" };

  it("accepts a minimal package and applies defaults", () => {
    const parsed = programPackageSchema.parse({ ...base, modules: [{ slug: "m", title: "M", tasks: [task] }] });
    expect(parsed.modules[0]!.tasks[0]).toMatchObject({ required: true, completionRule: "review", isPublished: true });
  });

  it("rejects duplicate slugs, bad file settings and unknown fields", () => {
    const dupModules = { ...base, modules: [{ slug: "m", title: "A" }, { slug: "m", title: "B" }] };
    const dupTasks = { ...base, modules: [{ slug: "a", title: "A", tasks: [task] }, { slug: "b", title: "B", tasks: [task] }] };
    const fileOnText = { ...base, modules: [{ slug: "m", title: "M", tasks: [{ ...task, allowedFileTypes: [".pdf"] }] }] };
    const fileNoTypes = { ...base, modules: [{ slug: "m", title: "M", tasks: [{ ...task, taskType: "file" }] }] };
    const badType = { ...base, modules: [{ slug: "m", title: "M", tasks: [{ ...task, taskType: "file", allowedFileTypes: [".exe"] }] }] };
    const unknown = { ...base, modules: [{ slug: "m", title: "M", html: "<script>" }] };
    for (const pkg of [dupModules, dupTasks, fileOnText, fileNoTypes, badType, unknown]) {
      expect(programPackageSchema.safeParse(pkg).success).toBe(false);
    }
  });
});

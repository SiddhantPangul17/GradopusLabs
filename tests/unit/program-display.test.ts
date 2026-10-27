import { describe, expect, it } from "vitest";
import { moduleDisplay } from "@/lib/program-display";

describe("moduleDisplay", () => {
  it("uses the topic prefix when the title is a placeholder", () => {
    expect(moduleDisplay({ title: "Module 5", topics: ["React.js: Components, props, state, hooks, and routing"] })).toEqual({
      title: "React.js",
      summary: "Components, props, state, hooks, and routing",
      topics: [],
    });
  });

  it("uses a single topic without a prefix as the title", () => {
    expect(moduleDisplay({ title: "module 1", topics: ["Getting started"] })).toEqual({ title: "Getting started", summary: null, topics: [] });
  });

  it("keeps a real title and shows a single topic as its summary", () => {
    expect(moduleDisplay({ title: "Backend", topics: ["Node.js: Express and REST"] })).toEqual({
      title: "Backend",
      summary: "Node.js: Express and REST",
      topics: [],
    });
  });

  it("keeps several topics as a list", () => {
    expect(moduleDisplay({ title: "Module 2", topics: ["HTML", "CSS"] })).toEqual({ title: "Module 2", summary: null, topics: ["HTML", "CSS"] });
  });
});

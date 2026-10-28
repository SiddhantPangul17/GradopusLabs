import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { freshModules, programInput } from "../helpers";

/* Importing a whole program from the admin dashboard, against a real (throwaway) MongoDB. */

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), refresh: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

let server: MongoMemoryServer;
let service: typeof import("@/lib/services/admin-import-service");
let M: {
  User: typeof import("@/models/user").UserModel;
  Program: typeof import("@/models/program").ProgramModel;
  Module: typeof import("@/models/learning-module").LearningModuleModel;
  Task: typeof import("@/models/learning-task").LearningTaskModel;
  AuditLog: typeof import("@/models/audit-log").AuditLogModel;
};
type Actor = { id: string; role: "student" | "admin" };
let admin: Actor;
let student: Actor;

function pkg(slug: string, overrides: { program?: Record<string, unknown>; modules?: unknown[] } = {}) {
  return {
    program: { ...programInput({ slug, title: `Imported ${slug}` }), ...overrides.program },
    modules: overrides.modules ?? [
      {
        slug: "intro",
        title: "Introduction",
        content: "## Welcome",
        tasks: [],
      },
      {
        slug: "practice",
        title: "Practice",
        content: "Do the task.",
        tasks: [
          {
            slug: "first-task",
            title: "First task",
            instructions: "Submit a link.",
            taskType: "project_url",
            evaluationCriteria: ["It works"],
          },
        ],
      },
    ],
  };
}
const json = (value: unknown) => JSON.stringify(value);

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await freshModules({ MONGODB_URI: server.getUri(), MONGODB_DB_NAME: "krushitech_import_test", NODE_ENV: "test" });
  service = await import("@/lib/services/admin-import-service");
  M = {
    User: (await import("@/models/user")).UserModel,
    Program: (await import("@/models/program")).ProgramModel,
    Module: (await import("@/models/learning-module")).LearningModuleModel,
    Task: (await import("@/models/learning-task")).LearningTaskModel,
    AuditLog: (await import("@/models/audit-log")).AuditLogModel,
  };
  await (await import("@/lib/db/mongodb")).connectToDatabase();
  await Promise.all(Object.values(M).map((model) => model.init()));
  const make = async (email: string, role: "student" | "admin") =>
    ({ id: (await M.User.create({ name: role, email, role, passwordHash: "x" }))._id.toString(), role }) as Actor;
  admin = await make("admin@example.com", "admin");
  student = await make("student@example.com", "student");
});

afterAll(async () => {
  const db = await import("@/lib/db/mongodb");
  await (await db.connectToDatabase()).disconnect();
  await server?.stop();
});

describe("importProgramAsAdmin", () => {
  it("refuses non-admins", async () => {
    await expect(service.importProgramAsAdmin(student, json(pkg("nope")))).rejects.toThrow();
    expect(await M.Program.countDocuments({ slug: "nope" })).toBe(0);
  });

  it("creates a draft program with its modules and tasks, even if the file says published, and audits it", async () => {
    const result = await service.importProgramAsAdmin(admin, json(pkg("fresh", { program: { status: "published" } })));
    expect(result).toMatchObject({ ok: true, data: { created: true, modules: 2, tasks: 1 } });
    if (!result.ok) return;

    const program = await M.Program.findById(result.data.programId).lean();
    expect(program?.status).toBe("draft");
    expect(await M.Module.countDocuments({ programId: program?._id, isPublished: true })).toBe(2);
    expect(await M.Task.countDocuments({ programId: program?._id, isPublished: true })).toBe(1);

    const entry = await M.AuditLog.findOne({ action: "curriculum.imported", entityId: program?._id }).lean();
    expect(entry?.actorId?.toString()).toBe(admin.id);
    expect(entry?.metadata).toMatchObject({ via: "admin", slug: "fresh" });
  });

  it("re-importing a draft updates it in place and hides what the file no longer contains", async () => {
    const before = await M.Module.findOne({ slug: "practice" }).lean();
    const updated = pkg("fresh", { program: { title: "Renamed program" } });
    updated.modules = (updated.modules as { slug: string }[]).filter((module) => module.slug === "practice");

    const result = await service.importProgramAsAdmin(admin, json(updated));
    expect(result).toMatchObject({ ok: true, data: { created: false, modules: 1, tasks: 1 } });

    const program = await M.Program.findOne({ slug: "fresh" }).lean();
    expect(program?.title).toBe("Renamed program");
    expect((await M.Module.findOne({ slug: "practice" }).lean())?._id.toString()).toBe(before?._id.toString());
    expect((await M.Module.findOne({ slug: "intro" }).lean())?.isPublished).toBe(false);
    expect(await M.Program.countDocuments({ slug: "fresh" })).toBe(1);
  });

  it("never imports over a published or archived program", async () => {
    await M.Program.updateOne({ slug: "fresh" }, { $set: { status: "published" } });
    const result = await service.importProgramAsAdmin(admin, json(pkg("fresh", { program: { title: "Changed" } })));
    expect(result).toMatchObject({ ok: false, error: "conflict" });
    expect((await M.Program.findOne({ slug: "fresh" }).lean())?.title).toBe("Renamed program");
  });

  it("reports broken JSON and invalid content without saving anything", async () => {
    const broken = await service.importProgramAsAdmin(admin, '{"program": ');
    expect(broken).toMatchObject({ ok: false, error: "invalid", fieldErrors: { packageJson: expect.stringContaining("not valid JSON") } });

    const invalid = await service.importProgramAsAdmin(admin, json(pkg("bad-content", { program: { title: "" } })));
    expect(invalid).toMatchObject({ ok: false, error: "invalid", fieldErrors: { packageJson: expect.stringContaining("Program details, title") } });
    expect(await M.Program.countDocuments({ slug: "bad-content" })).toBe(0);
  });

  it("refuses file-upload tasks", async () => {
    const withFile = pkg("with-file", {
      modules: [
        {
          slug: "m",
          title: "Module",
          content: "x",
          tasks: [{ slug: "upload", title: "Upload a screenshot", taskType: "file", allowedFileTypes: [".png"] }],
        },
      ],
    });
    const result = await service.importProgramAsAdmin(admin, json(withFile));
    expect(result).toMatchObject({ ok: false, fieldErrors: { packageJson: expect.stringContaining("Upload a screenshot") } });
    expect(await M.Program.countDocuments({ slug: "with-file" })).toBe(0);
  });
});

import { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { freshModules, programInput } from "../helpers";

/*
 * Runs against a real, throwaway mongod (mongodb-memory-server) to verify
 * indexes, constraints and queries. Run with `npm run test:db`.
 * Set MONGOMS_SYSTEM_BINARY to use a locally installed mongod instead of a download.
 */

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));

let server: MongoMemoryServer;
let db: typeof import("@/lib/db/mongodb");
let models: {
  Program: typeof import("@/models/program").ProgramModel;
  User: typeof import("@/models/user").UserModel;
  Enrollment: typeof import("@/models/enrollment").EnrollmentModel;
  AuditLog: typeof import("@/models/audit-log").AuditLogModel;
};
let programs: typeof import("@/lib/services/program-service");
let enrollments: typeof import("@/lib/services/enrollment-service");
let users: typeof import("@/lib/services/user-service");

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await freshModules({ MONGODB_URI: server.getUri(), MONGODB_DB_NAME: "krushitech_test", NODE_ENV: "test" });

  db = await import("@/lib/db/mongodb");
  models = {
    Program: (await import("@/models/program")).ProgramModel,
    User: (await import("@/models/user")).UserModel,
    Enrollment: (await import("@/models/enrollment")).EnrollmentModel,
    AuditLog: (await import("@/models/audit-log")).AuditLogModel,
  };
  programs = await import("@/lib/services/program-service");
  enrollments = await import("@/lib/services/enrollment-service");
  users = await import("@/lib/services/user-service");

  await db.connectToDatabase();
  // Build all indexes before testing constraints.
  await Promise.all(Object.values(models).map((model) => model.init()));
});

afterAll(async () => {
  const mongoose = await db?.connectToDatabase().catch(() => null);
  await mongoose?.disconnect();
  await server?.stop();
});

const admin = { id: new Types.ObjectId().toString(), role: "admin" as const };
const isDuplicateKey = (error: unknown) => (error as { code?: number }).code === 11000;

describe("connection", () => {
  it("connects, reuses the connection and reports healthy", async () => {
    const first = await db.connectToDatabase();
    const second = await db.connectToDatabase();
    expect(first).toBe(second);
    expect(first.connection.db?.databaseName).toBe("krushitech_test");
    expect(await db.checkDatabaseHealth()).toBe("connected");
  });
});

describe("indexes exist in MongoDB", () => {
  it("creates the unique and partial unique indexes", async () => {
    const programIndexes = await models.Program.listIndexes();
    expect(programIndexes.find((index) => index.key.slug === 1)?.unique).toBe(true);

    const userIndexes = await models.User.listIndexes();
    expect(userIndexes.find((index) => index.key.email === 1)?.unique).toBe(true);

    const enrollmentIndexes = await models.Enrollment.listIndexes();
    const current = enrollmentIndexes.find((index) => index.name === "unique_current_enrollment");
    expect(current?.unique).toBe(true);
    expect(current?.partialFilterExpression).toEqual({ status: { $in: ["pending", "active"] } });
  });
});

describe("programs", () => {
  it("enforces unique slugs at the database level", async () => {
    await models.Program.create(programInput({ slug: "unique-slug" }));
    const error = await models.Program.create(programInput({ slug: "unique-slug" })).catch((caught: unknown) => caught);
    expect(isDuplicateKey(error)).toBe(true);
  });

  it("returns only published programs to public queries", async () => {
    await models.Program.create([
      programInput({ slug: "public-one", status: "published", displayOrder: 2 }),
      programInput({ slug: "public-two", status: "published", displayOrder: 1, featured: true }),
      programInput({ slug: "still-draft", status: "draft" }),
      programInput({ slug: "old-archived", status: "archived" }),
    ]);

    const list = await programs.findPublishedPrograms();
    expect(list.map((program) => program.slug)).toEqual(["public-two", "public-one"]);
    expect(await programs.findPublishedProgramSlugs()).toEqual(expect.arrayContaining(["public-one", "public-two"]));
    expect(await programs.findPublishedProgramSlugs()).not.toContain("still-draft");
    expect(await programs.findPublishedProgramBySlug("still-draft")).toBeNull();
    expect(await programs.findPublishedProgramBySlug("old-archived")).toBeNull();
    expect(await programs.findPublishedProgramBySlug("does-not-exist")).toBeNull();
    expect(await programs.findPublishedProgramBySlug("public-one")).not.toBeNull();
  });

  it("maps records to the stable Program shape used by the pages", async () => {
    const { programFixtures } = await import("@/data/programs");
    const program = await programs.findPublishedProgramBySlug("public-one");
    expect(Object.keys(program ?? {}).sort()).toEqual(Object.keys(programFixtures[0]).sort());
    expect(program?.overview).toEqual(["First paragraph.", "Second paragraph."]);
    expect(program?.pricePaise).toBe(9900);
    expect(program).not.toHaveProperty("status");
    expect(program).not.toHaveProperty("_id");
  });

  it("createProgram: admin only, validated, conflict-safe and audited", async () => {
    await expect(programs.createProgram(programInput({ slug: "new-one" }), { id: admin.id, role: "student" })).rejects.toMatchObject({
      code: "not_authorized",
    });
    await expect(programs.createProgram(programInput({ price: -5 }), admin)).rejects.toBeInstanceOf(ZodError);

    const created = await programs.createProgram(programInput({ slug: "new-one" }), admin);
    expect(created.slug).toBe("new-one");
    await expect(programs.createProgram(programInput({ slug: "new-one" }), admin)).rejects.toMatchObject({ code: "conflict" });

    const entry = await models.AuditLog.findOne({ entityId: created.id }).lean();
    expect(entry?.action).toBe("program.created");
    expect(entry?.actorId?.toString()).toBe(admin.id);
    expect(entry?.metadata).toEqual({ slug: "new-one", status: "draft" });
  });
});

describe("users", () => {
  it("treats emails case-insensitively for uniqueness", async () => {
    await models.User.create({ name: "Asha", email: "Asha@Example.com", passwordHash: "hash" });
    const error = await models.User.create({ name: "Other", email: " asha@example.COM " }).catch((caught: unknown) => caught);
    expect(isDuplicateKey(error)).toBe(true);
  });

  it("never returns passwordHash", async () => {
    const doc = await models.User.findOne({ email: "asha@example.com" }).lean();
    expect(doc).not.toHaveProperty("passwordHash");
    const safe = await users.findUserById(doc!._id.toString());
    expect(safe).toMatchObject({ email: "asha@example.com", role: "student" });
    expect(safe).not.toHaveProperty("passwordHash");
    expect(await users.findUserById("not-an-id")).toBeNull();
  });
});

describe("enrollments", () => {
  const studentId = new Types.ObjectId();
  const otherStudent = new Types.ObjectId();
  const programId = new Types.ObjectId();

  it("allows only one pending/active enrolment per student and program", async () => {
    const first = await models.Enrollment.create({ studentId, programId, status: "pending" });
    const duplicate = await models.Enrollment.create({ studentId, programId, status: "active" }).catch((caught: unknown) => caught);
    expect(isDuplicateKey(duplicate)).toBe(true);
    expect(await enrollments.hasCurrentEnrollment(studentId.toString(), programId.toString())).toBe(true);

    // After cancelling, a new enrolment is allowed.
    await models.Enrollment.updateOne({ _id: first._id }, { status: "cancelled" });
    expect(await enrollments.hasCurrentEnrollment(studentId.toString(), programId.toString())).toBe(false);
    await expect(models.Enrollment.create({ studentId, programId, status: "pending" })).resolves.toBeDefined();
  });

  it("shows an enrolment only to its student or an admin", async () => {
    const doc = await models.Enrollment.create({ studentId: otherStudent, programId, status: "pending" });
    const id = doc._id.toString();
    expect(await enrollments.getEnrollmentForViewer(id, { id: otherStudent.toString(), role: "student" })).toMatchObject({ id, status: "pending" });
    expect(await enrollments.getEnrollmentForViewer(id, { id: studentId.toString(), role: "student" })).toBeNull();
    expect(await enrollments.getEnrollmentForViewer(id, admin)).not.toBeNull();
    expect(await enrollments.getEnrollmentForViewer("bad-id", admin)).toBeNull();
  });
});

describe("audit log", () => {
  it("is append-only", async () => {
    const entry = await models.AuditLog.create({ action: "program.updated", entityType: "program", entityId: new Types.ObjectId() });
    await expect(models.AuditLog.updateOne({ _id: entry._id }, { action: "program.archived" })).rejects.toThrow(/cannot be modified/);
    await expect(models.AuditLog.deleteOne({ _id: entry._id })).rejects.toThrow(/cannot be modified/);
    entry.set("action", "program.archived");
    await expect(entry.save()).rejects.toThrow(/cannot be modified/);
  });
});

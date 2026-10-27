import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { AuditLogModel } from "@/models/audit-log";
import { EnrollmentModel } from "@/models/enrollment";
import { ProgramModel } from "@/models/program";
import { UserModel } from "@/models/user";
import { programInput } from "../helpers";

/* Schema rules checked without a database (document validation and index definitions). */

async function errorPaths(doc: { validate: () => Promise<unknown> }): Promise<string[]> {
  try {
    await doc.validate();
    return [];
  } catch (error) {
    return Object.keys((error as { errors?: Record<string, unknown> }).errors ?? {});
  }
}

function hasIndex(model: { schema: { indexes: () => [Record<string, unknown>, Record<string, unknown>][] } }, fields: Record<string, number>, options: Record<string, unknown> = {}) {
  return model.schema.indexes().some(
    ([keys, opts]) =>
      JSON.stringify(keys) === JSON.stringify(fields) &&
      Object.entries(options).every(([key, value]) => JSON.stringify(opts[key]) === JSON.stringify(value)),
  );
}

describe("Program model", () => {
  it("applies defaults: draft status, INR currency", async () => {
    const doc = new ProgramModel(programInput());
    expect(await errorPaths(doc)).toEqual([]);
    expect(doc.status).toBe("draft");
    expect(doc.currency).toBe("INR");
  });

  it("rejects invalid enums, prices and slugs", async () => {
    const doc = new ProgramModel(programInput({ status: "live", difficulty: "expert", price: 99.5, slug: "Bad Slug" }));
    expect(await errorPaths(doc)).toEqual(expect.arrayContaining(["status", "difficulty", "price", "slug"]));
    expect(await errorPaths(new ProgramModel(programInput({ price: -100 })))).toContain("price");
  });

  it("requires core fields", async () => {
    expect(await errorPaths(new ProgramModel({}))).toEqual(
      expect.arrayContaining(["title", "slug", "shortDescription", "description", "category", "difficulty", "price"]),
    );
  });

  it("throws on unknown fields (strict mode)", async () => {
    expect(() => new ProgramModel({ ...programInput(), enrollmentCount: 5000 })).toThrow();
  });

  it("defines a unique slug index and a catalogue index", async () => {
    expect(ProgramModel.schema.path("slug").options.unique).toBe(true);
    expect(hasIndex(ProgramModel, { status: 1, displayOrder: 1, createdAt: 1 })).toBe(true);
  });
});

describe("User model", () => {
  it("normalises email and defaults to an active student", async () => {
    const doc = new UserModel({ name: "Asha", email: "  Asha@Example.COM " });
    expect(doc.email).toBe("asha@example.com");
    expect(doc.role).toBe("student");
    expect(doc.accountStatus).toBe("active");
  });

  it("rejects unknown roles and account statuses", async () => {
    const doc = new UserModel({ name: "A", email: "a@example.com", role: "superadmin", accountStatus: "god" });
    expect(await errorPaths(doc)).toEqual(expect.arrayContaining(["role", "accountStatus"]));
  });

  it("enforces unique email and hides passwordHash by default", async () => {
    expect(UserModel.schema.path("email").options.unique).toBe(true);
    expect(UserModel.schema.path("passwordHash").options.select).toBe(false);
  });
});

describe("Enrollment model", () => {
  const ids = { studentId: new Types.ObjectId(), programId: new Types.ObjectId() };

  it("defaults to pending with zero paid", async () => {
    const doc = new EnrollmentModel(ids);
    expect(doc.status).toBe("pending");
    expect(doc.amountPaid).toBe(0);
  });

  it("rejects unknown statuses and fractional or negative amounts", async () => {
    expect(await errorPaths(new EnrollmentModel({ ...ids, status: "paid", amountPaid: 99.5 }))).toEqual(
      expect.arrayContaining(["status", "amountPaid"]),
    );
    expect(await errorPaths(new EnrollmentModel({ ...ids, amountPaid: -1 }))).toContain("amountPaid");
  });

  it("has a partial unique index allowing one pending/active enrollment per student and program", async () => {
    expect(
      hasIndex(EnrollmentModel, { studentId: 1, programId: 1 }, {
        unique: true,
        partialFilterExpression: { status: { $in: ["pending", "active"] } },
      }),
    ).toBe(true);
  });
});

describe("AuditLog model", () => {
  it("rejects unknown actions and entity types", async () => {
    const doc = new AuditLogModel({ action: "program.deleted_everything", entityType: "planet", entityId: new Types.ObjectId() });
    expect(await errorPaths(doc)).toEqual(expect.arrayContaining(["action", "entityType"]));
  });

  it("records createdAt only (append-only)", async () => {
    expect(AuditLogModel.schema.path("createdAt")).toBeDefined();
    expect(AuditLogModel.schema.path("updatedAt")).toBeUndefined();
  });
});

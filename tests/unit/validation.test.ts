import { describe, expect, it } from "vitest";
import { AUTH_LIMITS, AUTH_MESSAGES, checkNewPassword } from "@/lib/validation/auth-rules";
import { objectIdSchema, slugSchema } from "@/lib/validation/common";
import { programInputSchema } from "@/lib/validation/program";
import { registrationInputSchema } from "@/lib/validation/user";
import { programInput } from "../helpers";

describe("programInputSchema", () => {
  it("accepts valid input and applies safe defaults", () => {
    const parsed = programInputSchema.parse(programInput());
    expect(parsed.status).toBe("draft");
    expect(parsed.currency).toBe("INR");
    expect(parsed.availability).toBe("coming-soon");
    expect(parsed.featured).toBe(false);
  });

  it.each([
    ["negative price", { price: -1 }],
    ["fractional price (rupees instead of paise)", { price: 99.5 }],
    ["string price", { price: "9900" }],
    ["invalid slug", { slug: "Web Dev!" }],
    ["unknown status", { status: "live" }],
    ["invalid currency", { currency: "rupees" }],
    ["unknown difficulty", { difficulty: "expert" }],
    ["empty title", { title: "   " }],
    ["unknown field", { createdAt: "2020-01-01" }],
    ["client-supplied id", { _id: "507f1f77bcf86cd799439011" }],
    ["too many modules", { modules: Array.from({ length: 31 }, () => ({ title: "M", topics: [] })) }],
  ])("rejects %s", (_name, override) => {
    expect(programInputSchema.safeParse(programInput(override)).success).toBe(false);
  });
});

describe("registrationInputSchema", () => {
  const valid = {
    name: "Asha",
    email: "  Asha@Example.COM ",
    password: "a-long-password",
    confirmPassword: "a-long-password",
    acceptTerms: true,
  };

  it("normalises email", () => {
    expect(registrationInputSchema.parse(valid).email).toBe("asha@example.com");
  });

  it.each([
    ["role", { role: "admin" }],
    ["accountStatus", { accountStatus: "active" }],
    ["emailVerified", { emailVerified: new Date() }],
    ["passwordHash", { passwordHash: "x" }],
  ])("rejects a client-supplied %s", (_name, extra) => {
    expect(registrationInputSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
  });

  it("rejects short passwords and invalid emails", () => {
    expect(registrationInputSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
    expect(registrationInputSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("requires passwords of at least 6 characters, on the server and in the browser check", () => {
    expect(AUTH_LIMITS.passwordMin).toBe(6);
    expect(registrationInputSchema.safeParse({ ...valid, password: "12345", confirmPassword: "12345" }).success).toBe(false);
    expect(registrationInputSchema.safeParse({ ...valid, password: "123456", confirmPassword: "123456" }).success).toBe(true);
    expect(checkNewPassword("12345")).toBe(AUTH_MESSAGES.passwordTooShort);
    expect(checkNewPassword("123456")).toBeUndefined();
  });

  it("requires matching passwords and accepted terms", () => {
    expect(registrationInputSchema.safeParse({ ...valid, confirmPassword: "different-password" }).success).toBe(false);
    expect(registrationInputSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
  });
});

describe("common validators", () => {
  it("accepts only 24-character hex object ids", () => {
    expect(objectIdSchema.safeParse("507f1f77bcf86cd799439011").success).toBe(true);
    expect(objectIdSchema.safeParse("123").success).toBe(false);
    expect(objectIdSchema.safeParse({ $gt: "" }).success).toBe(false);
  });

  it("normalises and validates slugs", () => {
    expect(slugSchema.parse("  Web-Basics ")).toBe("web-basics");
    expect(slugSchema.safeParse("web--basics").success).toBe(false);
    expect(slugSchema.safeParse("../etc").success).toBe(false);
  });
});

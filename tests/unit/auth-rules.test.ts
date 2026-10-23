import { describe, expect, it } from "vitest";
import { getSafeRedirectPath, loginPath, postLoginRedirect } from "@/lib/auth/redirects";
import { checkLogin, checkPasswordReset, checkRegistration } from "@/lib/validation/auth-rules";
import { loginInputSchema, registrationInputSchema, resetPasswordInputSchema } from "@/lib/validation/user";

describe("safe redirects", () => {
  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "http:/evil.example",
    "/%0d%0aSet-Cookie:x",
    "/login",
    "/register?x=1",
    "/api/me",
    "",
    "relative/path",
  ])("rejects %s", (value) => {
    // Encoded CR/LF stays encoded (harmless); everything else must be rejected outright.
    const result = getSafeRedirectPath(value);
    if (value.startsWith("/%0d")) expect(result).toBe("/%0d%0aSet-Cookie:x");
    else expect(result).toBeNull();
  });

  it("rejects raw control characters and non-strings", () => {
    expect(getSafeRedirectPath("/student\r\nLocation: https://evil.example")).toBeNull();
    expect(getSafeRedirectPath(["/student"])).toBeNull();
    expect(getSafeRedirectPath(undefined)).toBeNull();
  });

  it("keeps safe internal paths, including query and hash", () => {
    expect(getSafeRedirectPath("/programs/web?x=1#top")).toBe("/programs/web?x=1#top");
  });

  it("sends each role to a permitted destination", () => {
    expect(postLoginRedirect("student", undefined)).toBe("/student");
    expect(postLoginRedirect("admin", undefined)).toBe("/admin");
    expect(postLoginRedirect("student", "/admin")).toBe("/student");
    expect(postLoginRedirect("student", "/admin/users?x=1")).toBe("/student");
    expect(postLoginRedirect("student", "https://evil.example")).toBe("/student");
    expect(postLoginRedirect("student", "/programs/abc")).toBe("/programs/abc");
    expect(postLoginRedirect("admin", "/admin/users")).toBe("/admin/users");
  });

  it("builds login URLs with only safe return paths", () => {
    expect(loginPath("/student")).toBe("/login?callbackUrl=%2Fstudent");
    expect(loginPath("https://evil.example")).toBe("/login");
  });
});

describe("client rules agree with server schemas", () => {
  const registration = [
    { name: "Asha", email: "asha@example.com", password: "a-long-password", confirmPassword: "a-long-password", acceptTerms: true },
    { name: "", email: "asha@example.com", password: "a-long-password", confirmPassword: "a-long-password", acceptTerms: true },
    { name: "Asha", email: "bad", password: "a-long-password", confirmPassword: "a-long-password", acceptTerms: true },
    { name: "Asha", email: "asha@example.com", password: "short", confirmPassword: "short", acceptTerms: true },
    { name: "Asha", email: "asha@example.com", password: "a-long-password", confirmPassword: "other-password", acceptTerms: true },
    { name: "Asha", email: "asha@example.com", password: "a-long-password", confirmPassword: "a-long-password", acceptTerms: false },
  ] as const;

  it.each(registration)("registration %#", (values) => {
    const clientValid = Object.keys(checkRegistration(values)).length === 0;
    expect(registrationInputSchema.safeParse(values).success).toBe(clientValid);
  });

  it("login and reset", () => {
    for (const values of [{ email: "a@b.co", password: "x" }, { email: "", password: "x" }, { email: "a@b.co", password: "" }]) {
      expect(loginInputSchema.safeParse(values).success).toBe(Object.keys(checkLogin(values)).length === 0);
    }
    const token = "a".repeat(43);
    for (const values of [
      { password: "a-long-password", confirmPassword: "a-long-password" },
      { password: "short", confirmPassword: "short" },
      { password: "a-long-password", confirmPassword: "nope-nope-nope" },
    ]) {
      expect(resetPasswordInputSchema.safeParse({ ...values, token }).success).toBe(
        Object.keys(checkPasswordReset(values)).length === 0,
      );
    }
  });

  it("rejects malformed reset tokens", () => {
    const values = { password: "a-long-password", confirmPassword: "a-long-password" };
    expect(resetPasswordInputSchema.safeParse({ ...values, token: "short" }).success).toBe(false);
    expect(resetPasswordInputSchema.safeParse({ ...values, token: `${"a".repeat(42)}$` }).success).toBe(false);
  });
});

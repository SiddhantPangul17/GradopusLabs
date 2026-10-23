import { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { freshModules } from "../helpers";

/*
 * Authentication and authorization against a real (throwaway) MongoDB.
 * `@/auth` is mocked so we can feed the session layer any cookie contents
 * and prove it trusts only the database for role, status and validity.
 */

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

let server: MongoMemoryServer;
let authService: typeof import("@/lib/services/auth-service");
let session: typeof import("@/lib/auth/session");
let adminService: typeof import("@/lib/services/admin-service");
let rateLimit: typeof import("@/lib/auth/rate-limit");
let User: typeof import("@/models/user").UserModel;
let ResetToken: typeof import("@/models/password-reset-token").PasswordResetTokenModel;

const PASSWORD = "correct-horse-battery";
let ipCounter = 0;
const freshIp = () => `10.0.0.${++ipCounter}`;

function registration(email: string, extra: Record<string, unknown> = {}) {
  return { name: "Test Student", email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true, ...extra };
}

async function createUser(email: string, overrides: Record<string, unknown> = {}) {
  expect(await authService.registerStudent(registration(email), { ip: freshIp() })).toEqual({ ok: true });
  if (Object.keys(overrides).length > 0) await User.updateOne({ email }, { $set: overrides });
  const doc = await User.findOne({ email }).select("+sessionVersion").lean();
  return { id: doc!._id.toString(), sessionVersion: doc!.sessionVersion };
}

/** Simulates the decoded Auth.js session cookie for the next getCurrentUser() call. */
function asSession(id: string | undefined, sessionVersion: number | undefined) {
  authMock.mockResolvedValue(id ? { user: { id }, sessionVersion, expires: "" } : null);
}

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await freshModules({
    MONGODB_URI: server.getUri(),
    MONGODB_DB_NAME: "krushitech_auth_test",
    AUTH_SECRET: "test-secret-that-is-long-enough-1234567890",
    NODE_ENV: "test",
  });
  authService = await import("@/lib/services/auth-service");
  session = await import("@/lib/auth/session");
  adminService = await import("@/lib/services/admin-service");
  rateLimit = await import("@/lib/auth/rate-limit");
  User = (await import("@/models/user")).UserModel;
  ResetToken = (await import("@/models/password-reset-token")).PasswordResetTokenModel;
  const db = await import("@/lib/db/mongodb");
  await db.connectToDatabase();
  await Promise.all([User.init(), ResetToken.init(), (await import("@/models/rate-limit")).RateLimitModel.init()]);
});

afterAll(async () => {
  const db = await import("@/lib/db/mongodb");
  await (await db.connectToDatabase()).disconnect();
  await server?.stop();
});

beforeEach(() => authMock.mockReset());

describe("registration", () => {
  it("creates an active student with an Argon2id hash (never plaintext)", async () => {
    await createUser("new.student@example.com");
    const doc = await User.findOne({ email: "new.student@example.com" }).select("+passwordHash").lean();
    expect(doc?.role).toBe("student");
    expect(doc?.accountStatus).toBe("active");
    expect(doc?.emailVerified).toBeNull();
    expect(doc?.termsAcceptedAt).toBeInstanceOf(Date);
    expect(doc?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(doc?.passwordHash).not.toContain(PASSWORD);
  });

  it("rejects attempts to register as admin or set status", async () => {
    for (const extra of [{ role: "admin" }, { accountStatus: "active" }, { sessionVersion: 99 }]) {
      const result = await authService.registerStudent(registration("sneaky@example.com", extra), { ip: freshIp() });
      expect(result).toMatchObject({ ok: false, reason: "invalid" });
    }
    expect(await User.countDocuments({ email: "sneaky@example.com" })).toBe(0);
  });

  it("handles duplicate emails safely, case-insensitively", async () => {
    await createUser("dupe@example.com");
    const result = await authService.registerStudent(registration("  DUPE@Example.com "), { ip: freshIp() });
    expect(result).toEqual({ ok: false, reason: "email_taken" });
    expect(await User.countDocuments({ email: "dupe@example.com" })).toBe(1);
  });

  it("rate limits sign-ups per IP", async () => {
    const ip = freshIp();
    const results = [];
    for (let i = 0; i < rateLimit.RATE_LIMITS.registerPerIp.limit + 1; i += 1) {
      results.push(await authService.registerStudent(registration(`burst${i}@example.com`), { ip }));
    }
    expect(results.at(-1)).toEqual({ ok: false, reason: "rate_limited" });
    expect(results.slice(0, -1).every((result) => result.ok)).toBe(true);
  });
});

describe("login", () => {
  it("accepts correct credentials and returns only id, role and session version", async () => {
    await createUser("login@example.com");
    const result = await authService.authenticateWithPassword("Login@Example.com", PASSWORD);
    expect(result).toMatchObject({ ok: true, user: { role: "student", sessionVersion: 0 } });
    expect(Object.keys((result as { user: object }).user).sort()).toEqual(["id", "role", "sessionVersion"]);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    expect(await authService.authenticateWithPassword("login@example.com", "wrong-password-123")).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(await authService.authenticateWithPassword("nobody@example.com", PASSWORD)).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
  });

  it("rejects suspended accounts, but only reveals it with the right password", async () => {
    await createUser("suspended@example.com", { accountStatus: "suspended" });
    expect(await authService.authenticateWithPassword("suspended@example.com", "wrong-password-123")).toMatchObject({
      reason: "invalid_credentials",
    });
    expect(await authService.authenticateWithPassword("suspended@example.com", PASSWORD)).toMatchObject({
      reason: "account_inactive",
    });
  });

  it("rate limiter blocks after the limit within a window", async () => {
    const rule = { scope: "test:limit", limit: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push((await rateLimit.consumeRateLimit(rule, "same-key")).allowed);
    expect(results).toEqual([true, true, true, false]);
    expect((await rateLimit.consumeRateLimit(rule, "other-key")).allowed).toBe(true);
  });
});

describe("session validation (data access layer)", () => {
  it("returns the user from the database; role comes from the database, not the cookie", async () => {
    const { id } = await createUser("session@example.com");
    asSession(id, 0);
    const user = await session.getCurrentUser();
    expect(user).toEqual({ id, name: "Test Student", email: "session@example.com", role: "student", emailVerified: false });
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("sessionVersion");
  });

  it("rejects missing, malformed and forged sessions", async () => {
    asSession(undefined, undefined);
    expect(await session.getCurrentUser()).toBeNull();
    asSession("not-an-id", 0);
    expect(await session.getCurrentUser()).toBeNull();
    asSession(new Types.ObjectId().toString(), 0);
    expect(await session.getCurrentUser()).toBeNull();
    const { id } = await createUser("noversion@example.com");
    asSession(id, undefined);
    expect(await session.getCurrentUser()).toBeNull();
  });

  it("logout (ending sessions) invalidates an existing cookie", async () => {
    const { id } = await createUser("logout@example.com");
    asSession(id, 0);
    expect(await session.getCurrentUser()).not.toBeNull();
    await authService.endAllSessions(id);
    asSession(id, 0); // the old cookie, replayed
    expect(await session.getCurrentUser()).toBeNull();
    asSession(id, 1); // a fresh login after logout
    expect(await session.getCurrentUser()).not.toBeNull();
  });

  it("a disabled account loses access immediately", async () => {
    const { id } = await createUser("disable-me@example.com");
    asSession(id, 0);
    expect(await session.getCurrentUser()).not.toBeNull();
    await User.updateOne({ _id: id }, { $set: { accountStatus: "suspended" } });
    asSession(id, 0);
    expect(await session.getCurrentUser()).toBeNull();
  });

  it("requireUser/requireAdmin redirect; students cannot reach admin", async () => {
    asSession(undefined, undefined);
    await expect(session.requireUser("/student")).rejects.toThrow("REDIRECT:/login?callbackUrl=%2Fstudent");

    const { id } = await createUser("student-not-admin@example.com");
    asSession(id, 0);
    await expect(session.requireAdmin()).rejects.toThrow("REDIRECT:/student");
    asSession(id, 0);
    await expect(session.requireStudent()).resolves.toMatchObject({ role: "student" });
  });

  it("API authorization returns 401 and 403 JSON", async () => {
    asSession(undefined, undefined);
    expect((await session.authorizeApiRequest()).response?.status).toBe(401);

    const { id } = await createUser("api-student@example.com");
    asSession(id, 0);
    expect((await session.authorizeApiRequest("admin")).response?.status).toBe(403);

    const adminUser = await createUser("api-admin@example.com", { role: "admin" });
    asSession(adminUser.id, 0);
    const result = await session.authorizeApiRequest("admin");
    expect(result.response).toBeUndefined();
    expect(result.user?.role).toBe("admin");
  });

  it("admin data service refuses non-admin actors even if called directly", async () => {
    const { id } = await createUser("direct-call@example.com");
    await expect(adminService.getAdminOverview({ id, role: "student" })).rejects.toMatchObject({ code: "not_authorized" });
  });
});

describe("password reset", () => {
  it("request gives the same result for known and unknown emails, and creates no token without email delivery", async () => {
    await createUser("reset-known@example.com");
    const known = await authService.requestPasswordReset("reset-known@example.com", { ip: freshIp() });
    const unknown = await authService.requestPasswordReset("reset-unknown@example.com", { ip: freshIp() });
    expect(known).toEqual(unknown);
    expect(known).toEqual({ deliveryAvailable: false, rateLimited: false });
    expect(await ResetToken.countDocuments()).toBe(0);
  });

  it("valid token: sets the new password, is single-use, and ends all sessions", async () => {
    const { id } = await createUser("reset@example.com");
    const token = await authService.createPasswordResetToken(id);
    const stored = await ResetToken.findOne({ userId: id }).lean();
    expect(stored?.tokenHash).toBe(authService.hashResetToken(token));
    expect(stored?.tokenHash).not.toBe(token);

    const newPassword = "a-brand-new-passphrase";
    const input = { token, password: newPassword, confirmPassword: newPassword };
    expect(await authService.resetPassword(input)).toEqual({ ok: true });
    expect(await authService.resetPassword(input)).toEqual({ ok: false, reason: "invalid_token" });

    expect(await authService.authenticateWithPassword("reset@example.com", PASSWORD)).toMatchObject({ ok: false });
    expect(await authService.authenticateWithPassword("reset@example.com", newPassword)).toMatchObject({ ok: true });
    asSession(id, 0); // a session from before the reset
    expect(await session.getCurrentUser()).toBeNull();
  });

  it("rejects expired, unknown and malformed tokens", async () => {
    const { id } = await createUser("expired@example.com");
    const token = await authService.createPasswordResetToken(id);
    await ResetToken.updateOne({ userId: id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const pw = { password: "another-long-password", confirmPassword: "another-long-password" };
    expect(await authService.resetPassword({ token, ...pw })).toEqual({ ok: false, reason: "invalid_token" });
    expect(await authService.resetPassword({ token: "x".repeat(43), ...pw })).toEqual({ ok: false, reason: "invalid_token" });
    expect(await authService.resetPassword({ token: "bad", ...pw })).toEqual({ ok: false, reason: "invalid_token" });
  });
});

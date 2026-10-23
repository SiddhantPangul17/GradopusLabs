import { beforeEach, describe, expect, it, vi } from "vitest";

/* A database outage must degrade pages gracefully, never grant access, and never be cached. */

const state = vi.hoisted(() => ({ session: null as null | { user: { id: string }; sessionVersion: number }, fail: true }));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;${url}` });
  },
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/env", async (original) => ({ ...(await original<typeof import("@/lib/env")>()), isAuthConfigured: () => true }));
vi.mock("@/lib/program-source", () => ({ getProgramDataSource: () => "database", reportUnconfiguredProgramSource: vi.fn() }));
vi.mock("@/lib/services/auth-service", async () => {
  const { DatabaseConnectionError } = await import("@/lib/db/mongodb");
  return {
    findUserForSession: async () => {
      if (state.fail) throw new DatabaseConnectionError("the cluster hostname could not be resolved");
      return { name: "Sam", email: "sam@example.com", role: "student", accountStatus: "active", emailVerified: null, sessionVersion: 0 };
    },
  };
});
vi.mock("@/lib/services/program-service", async () => {
  const { DatabaseConnectionError } = await import("@/lib/db/mongodb");
  return {
    PROGRAMS_CACHE_TAG: "programs",
    findPublishedPrograms: async () => {
      if (state.fail) throw new DatabaseConnectionError("the cluster hostname could not be resolved");
      return [{ slug: "web", featured: true }];
    },
    findPublishedProgramBySlug: async () => null,
  };
});

beforeEach(() => {
  state.fail = true;
  state.session = { user: { id: "6653a1b2c3d4e5f6a7b8c9d0" }, sessionVersion: 0 };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("program lists during a database outage", () => {
  it("report 'unavailable' instead of throwing, and recover as soon as the database is back", async () => {
    const { loadPrograms } = await import("@/lib/programs");
    expect(await loadPrograms()).toEqual({ programs: [], unavailable: true });
    expect(await loadPrograms({ featured: 3 })).toEqual({ programs: [], unavailable: true });
    state.fail = false;
    expect(await loadPrograms()).toMatchObject({ programs: [{ slug: "web" }], unavailable: false });
  });
});

describe("sessions during a database outage", () => {
  it("public pages see a signed-out visitor (nothing is granted)", async () => {
    const { getCurrentUser } = await import("@/lib/auth/session");
    expect(await getCurrentUser()).toBeNull();
  });

  it("protected pages report the outage instead of sending a signed-in person to log in", async () => {
    const { requireUser, requireAdmin, ServiceUnavailableError } = await import("@/lib/auth/session");
    await expect(requireUser("/student")).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(requireAdmin()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it("APIs answer 503, not 401", async () => {
    const { authorizeApiRequest } = await import("@/lib/auth/session");
    const result = await authorizeApiRequest("admin");
    expect(result.response?.status).toBe(503);
  });

  it("without a session cookie nothing touches the database, and protected pages redirect to login", async () => {
    state.session = null;
    const { requireUser } = await import("@/lib/auth/session");
    await expect(requireUser("/student")).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
  });
});

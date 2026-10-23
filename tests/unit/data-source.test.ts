import { afterEach, describe, expect, it, vi } from "vitest";
import { freshModules } from "../helpers";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("program data source", () => {
  it("uses fixtures only in development without a database", async () => {
    await freshModules({ NODE_ENV: "development", MONGODB_URI: "" });
    const { getPrograms, getProgramDataSource } = await import("@/lib/programs");
    expect(getProgramDataSource()).toBe("fixtures");
    expect((await getPrograms()).length).toBeGreaterThan(0);
  });

  it("never falls back to fixtures in production; returns no programs and logs an error", async () => {
    await freshModules({ NODE_ENV: "production", MONGODB_URI: "" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getPrograms, getProgramBySlug, getProgramDataSource } = await import("@/lib/programs");
    expect(getProgramDataSource()).toBe("unconfigured");
    expect(await getPrograms()).toEqual([]);
    expect(await getProgramBySlug("web-development-fundamentals")).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("MONGODB_URI is not set"));
    errorSpy.mockRestore();
  });

  it("uses the database whenever MONGODB_URI is set", async () => {
    await freshModules({ NODE_ENV: "development", MONGODB_URI: "mongodb://127.0.0.1:1/x" });
    const { getProgramDataSource } = await import("@/lib/programs");
    expect(getProgramDataSource()).toBe("database");
  });

  it("rejects malformed slugs before any lookup", async () => {
    await freshModules({ NODE_ENV: "development", MONGODB_URI: "" });
    const { getProgramBySlug } = await import("@/lib/programs");
    expect(await getProgramBySlug("../../etc/passwd")).toBeNull();
    expect(await getProgramBySlug("UPPER")).toBeNull();
  });
});

describe("database connection", () => {
  it("reports a missing configuration clearly", async () => {
    await freshModules({ MONGODB_URI: "" });
    const { connectToDatabase, DatabaseNotConfiguredError } = await import("@/lib/db/mongodb");
    await expect(connectToDatabase()).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
  });

  it("never leaks credentials or hosts in connection errors", async () => {
    await freshModules({ MONGODB_URI: "mongodb://dbuser:S3cretPa55@127.0.0.1:1/krushitech?serverSelectionTimeoutMS=500" });
    const { connectToDatabase, DatabaseConnectionError } = await import("@/lib/db/mongodb");
    const error = await connectToDatabase().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DatabaseConnectionError);
    const message = (error as Error).message;
    expect(message).not.toMatch(/S3cretPa55|dbuser|127\.0\.0\.1|mongodb:\/\//);
    expect(message).toContain("no server was reachable");
  });

  it("health check reports not_configured without exposing details", async () => {
    await freshModules({ MONGODB_URI: "" });
    const { checkDatabaseHealth } = await import("@/lib/db/mongodb");
    expect(await checkDatabaseHealth()).toBe("not_configured");
  });
});

describe("MONGODB_DNS_SERVERS", () => {
  it("accepts 1-4 IP addresses and rejects anything else", async () => {
    const parse = async (value: string | undefined) => {
      await freshModules({ MONGODB_URI: "mongodb+srv://u:p@cluster0.example.mongodb.net", MONGODB_DNS_SERVERS: value });
      const { getDatabaseConfig } = await import("@/lib/env");
      return getDatabaseConfig();
    };
    expect((await parse("8.8.8.8, 1.1.1.1"))?.dnsServers).toEqual(["8.8.8.8", "1.1.1.1"]);
    expect((await parse("2001:4860:4860::8888"))?.dnsServers).toEqual(["2001:4860:4860::8888"]);
    expect((await parse(undefined))?.dnsServers).toBeNull();
    expect((await parse(""))?.dnsServers).toBeNull();
    await expect(parse("dns.google")).rejects.toThrow(/MONGODB_DNS_SERVERS/);
    await expect(parse("8.8.8.8,1.1.1.1,9.9.9.9,8.8.4.4,1.0.0.1")).rejects.toThrow(/MONGODB_DNS_SERVERS/);
  });
});

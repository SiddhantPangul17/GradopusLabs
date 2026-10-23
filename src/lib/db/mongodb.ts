import "server-only";
import dns from "node:dns";
import mongoose from "mongoose";
import { getDatabaseConfig } from "@/lib/env";

/*
 * Shared MongoDB connection (Mongoose).
 *
 * - One connection per server process, reused by every request.
 * - Cached on globalThis so `next dev` hot reloads do not open a new
 *   connection (and connection pool) on every file change.
 * - Errors never include the connection string, credentials or hostnames.
 * - `server-only` makes importing this from a Client Component a build error.
 */

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("MONGODB_URI is not set. See docs/database-setup.md.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export class DatabaseConnectionError extends Error {
  constructor(reason: string) {
    super(`Could not connect to MongoDB: ${reason}. See docs/database-setup.md#troubleshooting.`);
    this.name = "DatabaseConnectionError";
  }
}

type ConnectionCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & { __krushitechMongoose?: ConnectionCache };
const cache: ConnectionCache = (globalForMongoose.__krushitechMongoose ??= { connection: null, promise: null });

// Reject query filters on fields that are not in the schema instead of
// silently ignoring them.
mongoose.set("strictQuery", true);

/**
 * Maps a driver error to a safe, actionable reason. The original message is
 * deliberately discarded because it can contain hostnames or credentials.
 */
function describeConnectionError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  const code = (error as { code?: unknown } | null)?.code;

  if (name === "MongoParseError" || /invalid scheme|URI must include|Invalid connection string/i.test(message)) {
    return "the connection string is invalid";
  }
  if (code === 18 || /auth(entication)? failed|bad auth/i.test(message)) {
    return "authentication failed (check the database username and password)";
  }
  if (/querySrv ECONNREFUSED|queryTxt ECONNREFUSED/i.test(message)) {
    return "this computer's DNS server refused the cluster lookup (set MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1 in .env.local, or use Atlas's standard mongodb:// connection string)";
  }
  if (/ENOTFOUND|querySrv|EAI_AGAIN/i.test(message)) {
    return "the cluster hostname could not be resolved (check the connection string and DNS)";
  }
  if (name === "MongooseServerSelectionError" || name === "MongoServerSelectionError") {
    return "no server was reachable in time (check Atlas network access and that the cluster is running)";
  }
  return "an unexpected connection error occurred";
}

export function isDatabaseConfigured(): boolean {
  return getDatabaseConfig() !== null;
}

/** Returns the shared Mongoose instance, connecting on first use. */
export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.connection && mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    return cache.connection;
  }

  const config = getDatabaseConfig();
  if (!config) throw new DatabaseNotConfiguredError();

  // mongodb+srv:// needs DNS SRV/TXT lookups through Node's own resolver. On some machines that
  // resolver points at an unreachable server (e.g. 127.0.0.1); MONGODB_DNS_SERVERS overrides it.
  // The callback and promise DNS APIs keep SEPARATE default resolvers (the MongoDB driver uses the
  // promise one), so both are set. Only dns.resolve*() is affected, not ordinary hostname lookups.
  if (config.dnsServers && !cache.promise) {
    dns.setServers(config.dnsServers);
    dns.promises.setServers(config.dnsServers);
  }

  cache.promise ??= mongoose.connect(config.uri, {
    dbName: config.dbName,
    appName: "gradopus-labs-platform",
    // Fail fast instead of queueing queries while disconnected.
    bufferCommands: false,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
  });

  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    // Allow the next call to retry with a fresh attempt.
    cache.promise = null;
    cache.connection = null;
    throw new DatabaseConnectionError(describeConnectionError(error));
  }
}

export type DatabaseHealth = "connected" | "not_configured" | "unavailable";

/** Lightweight reachability check that reuses the shared connection. */
export async function checkDatabaseHealth(timeoutMs = 3_000): Promise<DatabaseHealth> {
  if (!isDatabaseConfigured()) return "not_configured";

  try {
    const instance = await connectToDatabase();
    const db = instance.connection.db;
    if (!db) return "unavailable";

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("ping timed out")), timeoutMs);
    });
    try {
      await Promise.race([db.admin().ping(), timeout]);
    } finally {
      clearTimeout(timer);
    }
    return "connected";
  } catch (error) {
    console.error(`[db] health check failed: ${error instanceof DatabaseConnectionError ? error.message : "ping failed"}`);
    return "unavailable";
  }
}

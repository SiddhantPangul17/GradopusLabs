#!/usr/bin/env node
/**
 * Grant or revoke administrator access for an EXISTING account.
 *
 *   npm run admin:list
 *   npm run admin:grant  -- --email someone@example.com
 *   npm run admin:revoke -- --email someone@example.com
 *
 * - Run explicitly by an operator; never runs on app startup and has no web endpoint.
 * - The account must already exist (the person registers normally at /register).
 * - `grant` falls back to ADMIN_EMAIL when --email is not given.
 * - Asks you to type the email again to confirm (or pass --yes in automation).
 * - Refuses to remove the last active administrator.
 * - Ends the user's existing sessions and writes an audit-log entry.
 * - Never prints the connection string, passwords or tokens.
 *
 * Reads MONGODB_URI / MONGODB_DB_NAME from the environment, then .env.local, then .env.
 */
import dns from "node:dns";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import { createInterface } from "node:readline/promises";
import mongoose from "mongoose";

for (const file of [".env.local", ".env"]) {
  // Existing environment variables are not overridden.
  if (existsSync(file)) process.loadEnvFile(file);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, email: undefined, yes: false };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--email") options.email = rest[++i];
    else if (rest[i] === "--yes") options.yes = true;
    else fail(`Unknown argument "${rest[i]}".`);
  }
  return options;
}

async function confirm(email) {
  if (!process.stdin.isTTY) fail("Confirmation required. Re-run in a terminal, or pass --yes.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Type the email address again to confirm (${email}): `);
  rl.close();
  if (answer.trim().toLowerCase() !== email) fail("Confirmation did not match. Nothing was changed.");
}

async function main() {
  const { command, email: rawEmail, yes } = parseArgs(process.argv.slice(2));
  if (!["grant", "revoke", "list"].includes(command ?? "")) {
    fail('Usage: manage-admin.mjs <grant|revoke|list> [--email address] [--yes]');
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) fail("MONGODB_URI is not set (see docs/database-setup.md).");
  const dbName = process.env.MONGODB_DB_NAME || "krushitech";
  // Same optional override as the app (src/lib/db/mongodb.ts) for machines whose Node DNS resolver is unreachable.
  const dnsServers = (process.env.MONGODB_DNS_SERVERS ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  if (dnsServers.length > 0) {
    if (!dnsServers.every((ip) => isIP(ip) !== 0)) fail("MONGODB_DNS_SERVERS must be comma-separated IP addresses.");
    // The callback and promise APIs have separate default resolvers; the MongoDB driver uses the promise one.
    dns.setServers(dnsServers);
    dns.promises.setServers(dnsServers);
  }

  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000, appName: "gradopus-labs-admin-cli" });
  } catch {
    fail("Could not connect to MongoDB. Check MONGODB_URI and network access.");
  }
  const users = mongoose.connection.collection("users");
  const auditLogs = mongoose.connection.collection("audit_logs");

  try {
    if (command === "list") {
      const admins = await users
        .find({ role: "admin" }, { projection: { email: 1, name: 1, accountStatus: 1 } })
        .sort({ email: 1 })
        .toArray();
      if (admins.length === 0) console.log("No administrators.");
      for (const admin of admins) console.log(`${admin.email}  (${admin.name}, ${admin.accountStatus})`);
      return;
    }

    const email = (rawEmail ?? (command === "grant" ? process.env.ADMIN_EMAIL : undefined))?.trim().toLowerCase();
    if (!email) fail(command === "grant" ? "Pass --email or set ADMIN_EMAIL." : "Pass --email.");
    if (!EMAIL_PATTERN.test(email)) fail("That is not a valid email address.");

    const matches = await users.find({ email }, { projection: { _id: 1, name: 1, role: 1, accountStatus: 1 } }).toArray();
    if (matches.length === 0) fail(`No account found for ${email}. Ask the person to register at /register first.`);
    if (matches.length > 1) fail(`More than one account matches ${email}. Resolve this manually; nothing was changed.`);
    const [user] = matches;

    const targetRole = command === "grant" ? "admin" : "student";
    if (user.role === targetRole) {
      console.log(`${email} is already ${targetRole === "admin" ? "an administrator" : "not an administrator"}. Nothing to do.`);
      return;
    }
    if (command === "grant" && user.accountStatus !== "active") {
      fail(`${email} is ${user.accountStatus}. Only active accounts can be made administrators.`);
    }
    if (command === "revoke") {
      const otherActiveAdmins = await users.countDocuments({ role: "admin", accountStatus: "active", _id: { $ne: user._id } });
      if (otherActiveAdmins === 0) fail("Refusing to remove the last active administrator. Grant another admin first.");
    }

    console.log(`Account: ${user.name} <${email}>  role: ${user.role}  status: ${user.accountStatus}`);
    console.log(command === "grant" ? "This will GRANT administrator access." : "This will REVOKE administrator access.");
    if (!yes) await confirm(email);

    // Changing the role and ending existing sessions happen in one update.
    const result = await users.updateOne(
      { _id: user._id, role: user.role },
      { $set: { role: targetRole, updatedAt: new Date() }, $inc: { sessionVersion: 1 } },
    );
    if (result.modifiedCount !== 1) fail("The account changed while running. Nothing was changed; please retry.");

    await auditLogs.insertOne({
      actorId: null,
      action: "user.role_changed",
      entityType: "user",
      entityId: user._id,
      metadata: { from: user.role, to: targetRole, via: "cli" },
      createdAt: new Date(),
    });

    console.log(
      `Done: ${email} is now ${targetRole === "admin" ? "an administrator" : "a student"}. Their existing sessions were ended; they must log in again.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(() => fail("Unexpected error. Nothing may have been changed; check the database and retry."));

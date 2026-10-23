# Database setup (MongoDB Atlas)

Gradopus Labs stores its data in MongoDB Atlas and reads it with Mongoose from
server-side code only. This guide sets up a database for local development and
explains what production needs. No cluster is assumed to exist yet.

> Without a database, `npm run dev` still works: the program pages show
> clearly labelled **sample programs**. Production builds never use sample
> data; without `MONGODB_URI` the catalogue is empty and an error is logged.

## 1. Create a project and cluster

1. Sign in at <https://cloud.mongodb.com> and create a **project** (for example `krushitech`).
2. Choose **Create** → a cluster. A free or flex tier is enough for development.
   Pick a region close to where the app will be hosted (for India, Mumbai).
3. Wait for the cluster to finish provisioning.

## 2. Create a database user

1. Go to **Security → Database Access → Add New Database User**.
2. Use **Password** authentication and click **Autogenerate Secure Password**.
   Store it in a password manager.
3. Under **Database User Privileges**, grant only what the app needs:
   **Specific Privileges → `readWrite`** on the database `krushitech`
   (or the name you set in `MONGODB_DB_NAME`). Avoid `atlasAdmin`.
4. Use separate users (and ideally separate clusters or projects) for
   development and production.

## 3. Configure network access

Go to **Security → Network Access → Add IP Address**.

- **Development:** click **Add Current IP Address**. Remove it when you no
  longer need it, and update it if your IP changes.
- **Production:** allow only the outbound IP addresses of your hosting
  provider, or use private networking (VPC peering / private endpoints) if your
  plan and host support it.
- Do **not** leave `0.0.0.0/0` (access from anywhere) as a permanent setting.
  If a host truly has no fixed outbound IPs, prefer the host's static-egress or
  Atlas integration options; treat "anywhere" as a temporary last resort that
  relies entirely on a strong password, and review it regularly.

## 4. Get the connection string

1. On the cluster, click **Connect → Drivers** (Node.js).
2. Copy the `mongodb+srv://...` connection string.
3. Replace `<db_password>` with the user's password. If the password contains
   special characters such as `@ : / ? # [ ]`, URL-encode them
   (for example `@` becomes `%40`).

## 5. Configure `.env.local`

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/?retryWrites=true&w=majority
MONGODB_DB_NAME=krushitech
```

`MONGODB_DB_NAME` selects the database inside the cluster (default
`krushitech`). Both variables are server-only: never prefix them with
`NEXT_PUBLIC_`.

## 6. Start the app

```bash
npm install
npm run dev
```

Indexes (unique program slugs, unique emails, one current enrolment per student
and program, and query indexes) are created automatically by Mongoose the first
time each model connects.

## 7. Verify the connection

1. Open <http://localhost:3000/api/health>. Expected response:

   ```json
   { "status": "ok", "database": "connected" }
   ```

   Other values: `not_configured` (no `MONGODB_URI`) or `unavailable` (HTTP
   503; the reason is logged in the terminal, never returned).

2. Open <http://localhost:3000/programs>. The "Sample programs for preview"
   notice should be gone. The catalogue is empty until programs with
   `status: "published"` exist; draft and archived programs are never shown.
   Program management arrives with the admin dashboard in a later part.

Automated checks:

```bash
npm test          # unit tests, no database needed
npm run test:db   # integration tests against a throwaway in-memory MongoDB
```

`npm run test:db` downloads a MongoDB binary on first run. To use an installed
`mongod` instead, set `MONGOMS_SYSTEM_BINARY` to its path, for example
`C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe`. These tests never touch
your Atlas cluster.

## 8. Troubleshooting

Connection errors are reported with a safe reason (no hostnames or credentials):

| Message says | Likely cause | Fix |
| ------------ | ------------ | --- |
| `MONGODB_URI is not set` | Missing or empty variable | Add it to `.env.local` and restart `npm run dev` |
| `the connection string is invalid` | Typo or unencoded special characters | Copy the string again; URL-encode the password |
| `authentication failed` | Wrong user or password, or user lacks access to the database | Check Database Access; reset the password |
| `this computer's DNS server refused the cluster lookup` | Node.js on this machine queries a DNS server that isn't running (often `127.0.0.1` on some Windows networks), so `mongodb+srv://` SRV lookups fail although browsing works | Add `MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1` to `.env.local` and restart, or use Atlas's standard `mongodb://` string (Connect → Drivers) |
| `the cluster hostname could not be resolved` | Wrong host, or DNS blocks SRV lookups | Check the string; try another network/DNS |
| `no server was reachable in time` | IP not on the access list, cluster paused, or firewall blocks port 27017 | Check Network Access; resume the cluster |
| `Invalid environment configuration` at startup | A variable is set but malformed | Fix the named variable (values are not printed) |

Changes to `.env.local` require restarting the dev server.

## 9. Keep secrets out of Git

- `.gitignore` ignores every `.env*` file except `.env.example`.
- Only placeholders belong in `.env.example`.
- Run `git status` before committing and make sure no `.env.local` appears.
- Never paste connection strings into issues, chats or screenshots.
- If a credential leaks, rotate the database user's password in Atlas
  immediately and update every environment that uses it.

## 10. Production environment variables

Set these in your hosting provider's environment settings (not in files):

| Variable | Value |
| -------- | ----- |
| `MONGODB_URI` | Production cluster connection string (production-only user) |
| `MONGODB_DB_NAME` | Production database name |
| `SITE_URL` | The site's public URL, e.g. `https://your-domain` |
| `AUTH_SECRET` | Required once authentication is added |

Notes:

- **The build reads the database.** Program pages are prerendered at build time
  and refreshed hourly, or when program data changes. The build environment
  must therefore reach the cluster; if it cannot, the build fails instead of
  publishing an empty catalogue.
- Monitor `GET /api/health`; it returns `503` when the database is unreachable.
- For large collections, consider creating indexes manually and disabling
  automatic index builds.

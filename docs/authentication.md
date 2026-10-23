# Authentication and access control

Gradopus Labs uses **Auth.js (next-auth v5)** with email + password, inside the
same Next.js app and domain. There is one identity system: the `users`
collection in MongoDB.

## How it works

| Topic | Implementation |
| ----- | -------------- |
| Library | `next-auth@5.0.0-beta.32` (pinned; v5 is the App Router version of Auth.js) with the Credentials provider. Config: `src/auth.ts` |
| Passwords | Argon2id (`argon2`, 64 MiB, t=3). Plaintext is never stored or logged. Old hashes are upgraded on login |
| Session | Encrypted JWT in an `HttpOnly`, `SameSite=Lax` cookie; `Secure` with a `__Secure-` prefix over HTTPS. 7-day lifetime, refreshed daily. Nothing in `localStorage` |
| What the cookie holds | Only the user id and a **session version**. Never the role, name or email |
| Every request | `getCurrentUser()` (`src/lib/auth/session.ts`) loads the user from MongoDB and rejects the session if the account is not `active` or the session version changed |
| Logout | Increments the user's session version (ending **all** sessions, including copied cookies), clears the cookie, then does a full page load so no signed-in page stays in memory |
| Roles | `student` or `admin`, read from the database only. Changes apply on the next request |
| Rate limits | Stored in MongoDB (shared across instances): login 30/IP and 8/account per 15 min; sign-up 5/IP per hour; reset requests 10/IP and 3/account per hour |

### Authorization (deny by default)

Use these server-side helpers; never rely on hidden links or client data.

| Context | Helper | Result when not allowed |
| ------- | ------ | ----------------------- |
| Student page | `await requireStudent("/path")` | Redirect to `/login` (signed out) or the user's own dashboard |
| Admin page | `await requireAdmin("/path")` | Redirect to `/login` or `/student` |
| Any signed-in page | `await requireUser("/path")` | Redirect to `/login` |
| Route Handler | `const { user, response } = await authorizeApiRequest("admin")` | `401` JSON if signed out, `403` if wrong role |
| Server Action / service | Re-check inside: `getCurrentUser()` / `assertAdmin(actor)` | Throw / return an error |

Session reads must sit inside a `<Suspense>` boundary (Cache Components). `src/proxy.ts`
redirects cookie-less visitors away from `/student/*` and `/admin/*` early, but
that is a convenience: every page, action and API checks again.

After login, students go to `/student` and admins to `/admin`. A `callbackUrl`
is honoured only if it is a same-site path permitted for the user's role
(`src/lib/auth/redirects.ts`); external URLs are ignored.

## Configuration

`.env.local` (development) or your host's environment settings (production):

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `AUTH_SECRET` | Yes | 32+ random characters. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Changing it signs everyone out |
| `MONGODB_URI` | Yes | See [database-setup.md](database-setup.md) |
| `AUTH_TRUST_HOST=true` or `AUTH_URL` | Production | Required by Auth.js outside development unless the host sets it (e.g. Vercel) |
| `ADMIN_EMAIL` | Optional | Default target for `npm run admin:grant` |

Without `AUTH_SECRET` and `MONGODB_URI`, sign-in pages show "Accounts are not
available yet" and `/api/auth/*` returns `503`. Nothing is simulated.

## Creating the first administrator

There is no public admin sign-up, no hard-coded admin and nothing runs at
startup. An operator promotes an existing account:

1. The person registers normally at `/register` (this creates a student).
2. On a machine that can reach the database (with `MONGODB_URI` set, e.g. in
   `.env.local`), run:

   ```bash
   npm run admin:grant -- --email person@example.com
   ```

   The script shows the account, asks you to **type the email again** to
   confirm, changes the role, ends that user's sessions (they log in again)
   and writes an audit-log entry. Use `--yes` only in trusted automation.
   Without `--email` it uses `ADMIN_EMAIL`.
3. The person logs in and lands on `/admin`.

Other commands:

```bash
npm run admin:list                                     # list administrators
npm run admin:revoke -- --email person@example.com     # back to student
```

Revoking refuses to remove the last active administrator. The script fails
safely (changing nothing) if the account does not exist, is not active,
or changed while it ran, and never prints the connection string or secrets.

To lock an account out entirely, set its `accountStatus` to `suspended` or
`deactivated`; access ends on the next request. (An admin user-management
screen comes in a later part.)

## Password recovery

`/forgot-password` and `/reset-password` are built, including secure
single-use tokens: 256-bit random, stored only as a SHA-256 hash, valid for 30
minutes, consumed atomically, and a successful reset ends all sessions.

**No email provider is integrated**, so:

- In production, no token is created and the page says plainly that no email
  was sent. The response is identical whether or not the account exists.
- In development (`npm run dev`) the reset link is printed to the server
  console so the flow can be tested.

To enable it, integrate an email provider in `src/lib/email.ts` and send the
link in `requestPasswordReset()` (`src/lib/services/auth-service.ts`).

## Known limitations

- **Email addresses are not verified.** `emailVerified` stays empty and the UI
  says so.
- **Registration reveals whether an email is registered** ("an account already
  exists"). Without email verification this is the usual trade-off; login and
  password recovery do not reveal it.
- **Per-account login limits** can be triggered by someone guessing at another
  person's account, locking it out for up to 15 minutes.
- **Client IPs** come from `X-Forwarded-For`; deploy behind a proxy or host that
  sets it, or IP limits can be bypassed.
- **Logout ends sessions on all devices** (by design, so a copied cookie cannot
  outlive logout).
- Auth.js v5 is still published as a beta; it is pinned to an exact version.

## Verifying

```bash
npm test          # includes redirect and validation rules
npm run test:db   # auth flows against a throwaway MongoDB
```

# Emails and in-app notifications

Transactional emails and in-app notifications for students, inside this app.
There is no marketing email and no bulk sending, and admins cannot compose
messages.

**Status:** implemented and tested against a **simulated** email API. No real
email has been sent. Emails stay queued until a provider is configured, and
nothing is reported as sent unless the provider accepted it. "Accepted by the
provider" is not the same as "delivered to an inbox".

## What is sent, and when

| Event (after the change is saved) | Email | In-app |
| --------------------------------- | ----- | ------ |
| Student account created | Welcome (login + programs links; never claims the address is verified) | Welcome |
| Password reset requested (account exists) | Reset link (single-use, 30 min) | — |
| Payment verified as `paid` (webhook / checkout verification / reconciliation) | Payment confirmation (program, amount, provider payment reference, date, link) | Payment confirmed |
| Enrollment activated (verified payment or manual grant) | Enrollment confirmation with getting-started steps | You're enrolled |
| Review decision: accepted / changes requested / rejected | Outcome, feedback, link to the attempt | Submission reviewed |
| Certificate issued | Certificate ID, date, sign-in link, public `/verify?id=` link (the secret QR token is never emailed) | Certificate issued |
| Certificate revoked | Notice and link | Certificate revoked |
| Certificate corrected (replacement) | New and old IDs, link | Corrected certificate issued |

- Nothing is queued for failed sign-ups, pending, failed or unverified
  payments, failed activations, or "under review".
- Payment confirmations are queued only from the verified "paid" path, never
  from a browser redirect.

## How delivery works (outbox)

1. **Queue.** Each service calls `src/lib/notifications/events.ts` after its own
   database write succeeded. That creates:
   - an `email_jobs` document with one **idempotency key per event**, e.g.
     `payment_confirmation:<paymentId>`. A unique index means duplicate
     webhooks and retries never queue a second email;
   - a `notifications` document (also unique per event).

   Queueing never throws, so an email problem can't undo a payment, enrollment,
   review or certificate.
2. **Deliver.** `processEmailOutbox()` (`src/lib/email/outbox.ts`):
   - claims due jobs with a 2-minute **lease** (compare-and-set), so concurrent
     workers never send the same job; a crashed worker's job is picked up after
     the lease;
   - renders the email **at send time from current records**. If the event no
     longer holds (payment not paid, certificate no longer valid, review decision
     changed), the job is **cancelled**, not sent. No message bodies are stored;
   - sends with a provider **Idempotency-Key** that is the same on every attempt
     of a job, so a retry after an unclear failure doesn't create a second email.
3. **Retry.** Temporary failures (network, timeout, 429, 5xx, documented
   temporary errors) retry after 1 min, 5 min, 30 min and 2 h. After **5
   attempts** the job is `failed`, all within Resend's 24-hour idempotency
   window. Permanent errors (invalid recipient or parameters, auth, plan) fail
   immediately.
4. **Expire.** Jobs not sent within 72 hours are cancelled; a stale email is
   worse than none.
5. **When processing runs:**
   - right after the request that queued the job (Next.js `after()`; best
     effort);
   - **every few minutes** from a scheduler calling the processor endpoint
     (the reliable path);
   - when an admin presses "Process queue now".

**Password-reset emails** are sent directly after the response, so timing
doesn't reveal whether an account exists. They are not queued, because the raw
token would have to be stored. A job record without the link keeps the outcome
visible, and the person can request a new link if it failed. The token is never
logged or stored; only its hash is in `password_reset_tokens`. Without a
provider, production creates no token. Development only prints the link to the
server console, as before.

### Scheduler (required for reliable production delivery)

`GET` or `POST /api/notifications/process` with `Authorization: Bearer
<CRON_SECRET>` processes up to 50 due jobs. It returns 503 if `CRON_SECRET` is
unset and 401 for a wrong secret; the response contains counts only.

Options:
- **Vercel Cron** sends the `CRON_SECRET` bearer automatically. Plan limits
  apply: Hobby allows only daily jobs, so use Pro or an external scheduler for
  5-minute runs. Example `vercel.json`:
  `{"crons":[{"path":"/api/notifications/process","schedule":"*/5 * * * *"}]}`
- An external scheduler, such as GitHub Actions `schedule`, cron-job.org or
  Upstash QStash, POSTing every 5 minutes with the header.

Don't rely on a serverless function staying alive after it responds.

## In-app notifications

- `/student/notifications`:
  - own notifications only, newest first, 20 per page;
  - unread items are marked and announced to screen readers;
  - "Mark as read" and "Mark all as read".
- The student sub-navigation shows the unread count, as text plus a badge.
- Ownership is part of every query. Marking another user's notification behaves
  like a missing one.
- Links are **internal student paths only** (`/student/...`, no `//host`,
  schemes or `..`), validated when stored and when shown. They can't be used as
  open redirects.
- Database-backed, with no WebSockets.

## Admin monitoring

`/admin/notifications` (admins only):
- counts by status;
- filters by status and email type, 25 per page;
- recipient, attempts, a safe error code (never a provider message), and
  queued, accepted and next-try times;
- warnings when the provider or scheduler isn't configured.

Actions:
- **Retry** a failed, unexpired job. This re-queues the *same* job and
  idempotency key, and is audited as `email.retried`.
- **Process queue now.**

## Configuration

| Variable | Purpose |
| -------- | ------- |
| `EMAIL_PROVIDER` | `resend`, or empty to keep email off |
| `EMAIL_API_KEY` | Provider API key (server only) |
| `EMAIL_FROM` | Sender on a **verified domain**, e.g. `Gradopus Labs <noreply@mail.example.com>` (line breaks rejected) |
| `EMAIL_REPLY_TO` | Optional monitored reply address |
| `CRON_SECRET` | Bearer secret for the scheduled processor (32+ characters) |
| `SITE_URL` | Must be the public **https** URL in production (all links are absolute) |

None are `NEXT_PUBLIC_`. The provider code is isolated in
`src/lib/email/resend.ts` behind `EmailProvider`. Another provider means one
new file and a case in `createEmailProvider`.

### Choosing and setting up a provider

Resend is implemented: a simple REST API with idempotency keys and a free tier.
Check its current pricing, sending limits and terms before launch. Other
providers (Postmark, Amazon SES, SendGrid) would also work behind the same
interface.

1. Create an account and **add a sending domain**. A subdomain such as
   `mail.your-domain` is recommended.
2. Add the DNS records the provider shows:
   - **SPF** (TXT) and **DKIM** (TXT/CNAME), usually also an MX record for
     bounces on the subdomain;
   - a **DMARC** TXT record for the domain, e.g. `v=DMARC1; p=none; rua=mailto:…`
     to start.

   Wait until the provider reports the domain as verified. Until then, real
   recipients can't be reached.
3. Create an API key with sending permission only, and set the variables above
   and `CRON_SECRET`. Set up the scheduler.
4. **Development:** use a separate API key. Without a verified domain, Resend
   only allows its onboarding sender and delivery to your own address. Its test
   recipients (e.g. `delivered@resend.dev`) let you exercise sending without
   emailing real people. Check Resend's current docs for the exact rules.

## Privacy and retention

- Jobs store the recipient as a user id; the address is looked up at send
  time. They also store small non-sensitive values (e.g. the review decision),
  status, attempts and a short error code. They store no bodies, tokens,
  payment credentials or provider responses.
- Retention:
  - `email_jobs` are deleted **180 days** after creation;
  - `notifications` are deleted after **365 days** (TTL indexes).

  Adjust these in the privacy policy review.
- User text (names, titles, feedback) is HTML-escaped in emails; subjects are
  single-line. Links are built server-side from `SITE_URL`.
- Logs contain fixed messages and codes only, never addresses, tokens or keys.

## Preferences

All current emails are transactional and tied to the student's own account
activity: security, payment, enrollment, review results and certificates.
There is no optional or marketing email yet, so there are no preference
settings. If optional notifications are added later:
- add per-user preferences that never disable password resets or payment and
  security notices;
- keep consent for any marketing separate.

## Known limitations

- Queueing happens right after each business write, not in the same
  transaction. If that single insert fails, the business action still stands,
  an error is logged, and the email is missing. Paid payments re-queue their
  confirmation on any later webhook retry, verification or reconciliation. A
  full transactional outbox would need MongoDB transactions, which Atlas
  supports.
- Delivery to real inboxes, bounces and spam placement are untested: no
  provider account or verified domain exists yet.

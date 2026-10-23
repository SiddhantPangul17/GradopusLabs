# Analytics and operational monitoring

Admins only. Every figure is calculated from the database when the page or API
is requested, using read-only aggregations.
- No figure is hard-coded or estimated.
- Responses contain aggregates only: no names, emails, submission content,
  payment references, tokens or provider data.
- All metric definitions live in `src/lib/services/analytics-service.ts`, shared
  by pages, APIs and CSV exports.

| Page | API |
| ---- | --- |
| `/admin/analytics` (overview) | `GET /api/admin/analytics/overview` |
| `/admin/analytics/programs` | `GET /api/admin/analytics/programs` |
| `/admin/analytics/revenue` | `GET /api/admin/analytics/revenue` |
| `/admin/analytics/learning` (students, enrolments, submissions) | `GET /api/admin/analytics/learning` |
| `/admin/analytics/certificates` | `GET /api/admin/analytics/certificates` |
| `/admin/analytics/operations` | `GET /api/admin/analytics/operations` |
| CSV downloads | `GET /api/admin/analytics/export?report=…` |

Query parameters for all of them:
- `period`: `today`, `7d`, `30d` (default), `90d`, `365d`, `all` or `custom`;
- `from` and `to` (`YYYY-MM-DD`, with `custom`);
- `mode`: `live` (default) or `test`.

APIs reject unknown or invalid parameters with 400; pages fall back to the last
30 days and say so.

## Access
- **Pages:** `requireAdmin()`, which also checks the account is active.
- **APIs:** `authorizeApiRequest("admin")`, giving 401 when signed out and 403 for
  non-admins.
- **Services:** check again (`assertAdmin`).
- **Rate limits per admin:** 300 API calls and 30 exports per 15 minutes.
- **Query safety:** only fixed, server-built pipelines run. No client-supplied
  fields, operators or collection names are accepted.

## Dates and periods
- Timestamps are stored in UTC. Days are **India time** (`brand.timeZone`,
  Asia/Kolkata, no daylight saving).
- A period runs **from local midnight (inclusive) to local midnight
  (exclusive)**. A record at exactly midnight belongs to the day that starts
  then, so consecutive periods never double-count.
- Presets include today: "Last 7 days" is today plus the six days before it.
- Custom ranges are inclusive dates, up to **366 days**, not in the future, not
  before 2020. "All time" is unbounded but charted by month.
- Chart buckets:
  - by **day** up to 31 days;
  - by **week** (Monday start) up to 180 days;
  - by **month** beyond that.

  Buckets with no records show 0, which is a real zero, not missing data.
- **Event time:** each metric uses the time of the event it describes:

  | Metric | Time used |
  | ------ | --------- |
  | Registration | `users.createdAt` |
  | Enrolment started | `enrollments.createdAt` |
  | Payment collected | `payments.paidAt` (not order creation) |
  | Payment started | `payments.createdAt` |
  | Submission | `submittedAt` |
  | Review decision | `reviewedAt` |
  | Certificate issued, revoked or replaced | `issuedAt`, `revokedAt` or `supersededAt` |

Every figure is labelled **Current** (state now), **In selected period** or
**All time**.

## Revenue
- **Gross collected:** sum of `amount` for payments whose status is `paid` (or a
  refund state, which can only follow `paid`), with `paidAt` in the period.
  Created, authorized, pending, failed and cancelled payments are **never**
  revenue.
- **Counted once.** Each payment record is one provider order. Unique indexes
  and idempotent webhook handling (Part 8) mean duplicate webhooks never create
  or double-count records.
- **Never inferred from enrolments.** Manual enrolments involve no payment.
- **Per currency:** amounts are stored in minor units (paise) and never added
  across currencies.
- **Per mode:** live and test payments are reported separately and never
  combined. The default is live.
- **Refunds and net collected are unavailable.** Refunds aren't processed through
  the platform yet (Part 8), so no confirmed refund records exist. A payment
  refunded in the Razorpay dashboard still shows as collected. Once refunds are
  implemented, attribute them by refund confirmation date, net = gross − confirmed
  refunds per currency, and never treat requested, pending or partial refunds as
  complete.
- **"Payments started"** counts checkouts created in the period by their
  *current* status. It is not revenue.

## Programs
Enrolment figures are a **cohort**: enrolments *created* in the period, by
current status.
- **Completion rate** = enrolments that **met every requirement** ÷ enrolments
  that are **active or completed**. Pending and cancelled enrolments are excluded
  from the denominator, and "—" is shown when there are none.
- **Paid** = created by a verified payment (`source: payment`). **Manual** = granted
  by an admin.
- **Collected** follows the revenue rules. Pending submissions are current. The
  certificates column counts issuances in the period.
- Archived programs stay in every report. Internally, rows are keyed by program
  id; titles are for display.
- Current prices and curricula may differ from those when older enrolments
  started.
- No ratings or satisfaction data are collected or shown.

## Learning, students and submissions
- **Requirements met** uses each enrolment's progress snapshot. That snapshot is
  the cached result of the same rule used by the student pages and certificate
  eligibility, refreshed on every submission, review, reading mark and content
  change. There is no second definition of completion.
- **Current enrolments** means active or completed. Snapshot states shown:
  not started, in progress, waiting only on reviews, requirements met, and not
  calculated (no progress recorded yet).
- **Submissions:**
  - every attempt counts once;
  - "distinct tasks" counts distinct enrolment + task pairs;
  - "resubmissions" counts attempts after the first;
  - submission content is never read into reports.
- **Review time** runs from submission to the recorded decision (accept, request
  changes or reject). Decisions are counted by decision date. "Under review" is
  not a decision. Feedback edits don't change the decision time. The median uses
  MongoDB 7.0+ `$percentile` (Atlas default) and shows "not available"
  otherwise.
- **Met requirements, no certificate yet** counts current enrolments that met
  requirements and have no valid or revoked certificate. Issuing re-checks full
  eligibility (payment, criteria, account).
- **Not available:** "active learners", time spent or logins. Logins aren't
  recorded per day, and nothing is inferred from them.

## Certificates
The certificate records are the only source; PDF downloads and regenerations
are not issuances.
- **Issued in period** includes corrected replacements.
- **Ever issued** = all certificate records. Revocation and replacement never
  delete a record, so history is preserved.
- **Valid now** = status `issued`, matching public verification.

## CSV exports
Available reports:
- `programs`
- `revenue-by-period`
- `revenue-by-program`
- `learning-modules`
- `submissions-summary`
- `certificates-by-program`

Rules:
- Same filters and boundaries as the page.
- Aggregates only: no personal data, tokens, payment references or provider
  payloads.
- Text cells starting with `= + - @`, tab or carriage return are prefixed with
  `'`, which prevents formula injection.
- Limited to **5,000 rows**; the `X-Report-Truncated` header is set if cut.
- Direct download with `Cache-Control: private, no-store`, so no file URL is
  ever stored.
- Each export is audited (`analytics.exported`) with the report type and
  filters, never the contents.

## Operational status (`/admin/analytics/operations`)
Each indicator is **healthy**, **degraded**, **unavailable**, **not configured** or
**unknown**.

| Indicator | What it checks |
| --------- | -------------- |
| Application | The server rendered the page |
| Database | A ping, with response time |
| Email queue | Waiting, oldest due, failed (24 h and 7 days), stuck jobs, last accepted |
| Email scheduler | Whether `CRON_SECRET` is set. Runs aren't recorded, so this is "unknown" when set |
| Payments | Configuration; failed or stuck webhook deliveries; payments needing attention; payments unconfirmed for over 1 h |
| Certificate issuing | Configuration only. Issuing errors aren't recorded separately |
| Application errors | Unknown: errors go only to the server log, and no error tracker is configured |

Third-party services (Razorpay, email provider) are **not contacted**. Their own
health is never claimed, and checks never send payments or emails. No
hostnames, connection strings, secrets, provider responses or stack traces are
returned.

## Performance and indexes
- Every aggregation filters first on an indexed field:

  | Collection | Indexes |
  | ---------- | ------- |
  | users | `{role, createdAt}` |
  | enrollments | `{createdAt}`, `{programId, status}` |
  | payments | `{mode, status, paidAt}` *(new)*, `{status, createdAt}` |
  | submissions | `{status, submittedAt}`, `{reviewedAt}` *(new)* |
  | learning_progress | `{enrollmentId}` (lookups), `{snapshot.state}` *(new)* |
  | certificates | `{issuedAt}`, `{status, issuedAt}`, `{revokedAt}`, `{supersededAt}` *(new)* |
  | webhook_events | `{status, updatedAt}` *(new)* |
  | email_jobs | `{status, nextAttemptAt}` |

- Results are bounded: up to 500 programs, 300 modules and 400 chart buckets per
  report, and 5,000 CSV rows. No collection is loaded into memory.
- **No caching.** Figures are computed per request, so a payment confirmed or a
  certificate revoked a second ago is already reflected.
- **When to precompute:** at the current scale this is cheap. If requests slow
  down (roughly hundreds of thousands of enrolments or payments), add a nightly
  job writing daily aggregates to a small `analytics_daily` collection, and keep
  "current" figures live. A separate analytics store isn't needed before then.

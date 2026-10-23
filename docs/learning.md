# Student learning area (LMS)

The student portal lives in the same Next.js app under `/student`. Every page,
Server Action and API authorizes the request itself (`requireStudent()` /
`authorizeApiRequest("student")`), and every database query includes the
student's id, so another student's records behave exactly like records that do
not exist (404).

## Routes

| Route | Purpose |
| ----- | ------- |
| `/student` | Dashboard: real counts, programs to continue, recent submission activity |
| `/student/programs` | All the student's enrolments (active, pending, completed, cancelled) |
| `/student/programs/[enrollmentId]` | Program outline, module and task states, progress |
| `/student/programs/[enrollmentId]/modules/[moduleId]` | Module content, tasks, previous/next, "mark as complete" for reading modules |
| `/student/tasks/[taskId]` | Instructions, requirements, criteria, submission form, all attempts and feedback |
| `/student/submissions` | The student's own attempts, newest first, 20 per page |
| `/student/profile` | Change name and password (email is read-only) |

JSON API (same rules, cookie session; JSON bodies only):

| Endpoint | Responses |
| -------- | --------- |
| `GET /api/student/enrollments/:id` | 200, 401, 403 (not a student), 404 (not yours / not found) |
| `GET /api/student/submissions?page=N` | 200, 401, 403 |
| `POST /api/student/tasks/:taskId/submissions` | 201, 400 (invalid), 401, 403 (program completed), 404 (no access), 409 (not allowed now), 413, 415 |

## Data model

| Collection | Notes |
| ---------- | ----- |
| `learning_modules` | Per program; stable ObjectId plus a per-program `slug`; `order`; Markdown `content`; `isPublished` |
| `learning_tasks` | Per module; `taskType` (`text`, `project_url`, `file`); `required`; `completionRule` (`review` or `submission`); optional `dueDate`; `evaluationCriteria`; `isPublished` |
| `submissions` | One document per **attempt**; unique `(enrollmentId, taskId, attempt)`; status `submitted` → `under_review` / `accepted` / `changes_requested` / `rejected` |
| `learning_progress` | One per enrolment (unique); stores reading modules marked as done and a cached snapshot |
| `enrollments` | Now records `source`: `manual` (operator) or `payment` (future) |

Unpublished modules and tasks are never returned to students and never count
towards progress.

## Progress and certificate eligibility (the single rule)

Implemented once in `src/lib/learning/progress.ts` (pure, unit-tested) and used
by every page, the API, the stored snapshot and, later, certificate issuance.

1. **Task state** comes from the task's latest attempt: `accepted` → completed;
   `submitted`/`under_review` → completed for `submission` tasks, *awaiting review*
   for `review` tasks; `changes_requested` / `rejected` → needs work; none → not started.
2. **Module complete**: all its published **required** tasks are completed; a
   module with no required tasks (reading module) is complete when the student
   marks it as done.
3. **Progress %** = completed modules ÷ published modules, rounded down.
4. **Program state**: `requirements_completed` when every module is complete
   (this is certificate eligibility); `awaiting_review` when only reviews are
   outstanding; otherwise `in_progress` / `not_started` (`no_content` when nothing
   is published).
5. Optional tasks never affect completion or eligibility.

Progress is derived from the database every time a page renders; the
`learning_progress.snapshot` is only a cache (refreshed after every
submission, review and module completion) for future admin reporting.
Eligibility does **not** issue a certificate; no certificate is shown as earned.

## Submissions and resubmission policy

- Students only create new attempts with status `submitted`. Status, score,
  feedback and reviewer are rejected if sent (`.strict()` schemas) and can only
  be written by `reviewSubmission()` (admin-only, audited, transitions enforced
  with an atomic compare-and-set). The admin review screen comes later.
- A new attempt is allowed when there is none yet, after `changes_requested` or
  `rejected`, or anytime for `submission` tasks; not while a `review` task is
  waiting for review, and not after acceptance. Maximum 10 attempts per task.
  Earlier attempts and their feedback are always kept.
- Concurrent double-submits: the unique attempt index lets exactly one succeed;
  the other gets `409`.
- **Project links** must be absolute `https://` URLs with a real hostname and no
  credentials (`javascript:`, `data:`, `http:` and others are rejected). They are
  never fetched by the server and are rendered with
  `rel="noopener noreferrer nofollow ugc"`.
- **Text answers** (up to 10,000 characters) are shown as plain text.
- Due dates are informational: late work is accepted, and reviewers can see the
  submission date.

### File submissions (not available)

No private file storage is configured, so `file` tasks show "File submissions
are not available yet" and the server rejects them. Nothing is uploaded or
stored. To enable uploads later: add private object storage (e.g. S3, R2 or GCS
with a private bucket), validate type/size/content server-side, generate random
object keys, store a `fileReference` on the submission, and serve files only
through short-lived signed URLs after an ownership check.

## Access rules

| Enrolment | Program published / archived | Program draft |
| --------- | ---------------------------- | ------------- |
| active | Full access (read and submit) | No access ("temporarily unavailable") |
| completed | Read-only (content and own submissions) | No access |
| pending / cancelled | No access (status shown) | No access |

Archived programs are hidden from the public catalogue but stay available to
students already enrolled.

## Content safety

Module content and task instructions are Markdown rendered with
`react-markdown`: raw HTML is dropped, unsafe link protocols are removed,
images are disabled for now, and external links open with
`rel="noopener noreferrer nofollow"`.

## Operating it (no admin dashboard yet)

**Add or update a program and its content:**

```bash
npm run content:import -- --file path/to/program.json
```

See `docs/examples/sample-program.json` for the format (a development sample;
its status is `draft`, so do not publish it in production). The whole file is
validated first. Modules and tasks are matched by `slug` and updated in place,
so ids, progress and submissions are kept; anything removed from the file is
unpublished, never deleted. Public program pages refresh within an hour.

**Enrol a student** (until online payment exists):

```bash
npm run enroll:student -- --email student@example.com --program program-slug
```

The student must already have registered and the program must be published.
The enrolment is recorded as `source: manual` with `amountPaid: 0` and written
to the audit log. Both scripts ask for confirmation (pass `--yes` in
automation) and never print secrets.

There is no self-service enrolment and no simulated payment.

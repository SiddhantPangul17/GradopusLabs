# Admin dashboard

Administrators manage the platform at `/admin`, inside the same app and domain.
Every admin page calls `requireAdmin()`, every admin Server Action re-checks
the session and the `admin` role, and every admin service calls
`assertAdmin(actor)` again, so hiding links is never the security boundary.
The acting administrator always comes from the server-side session; forms
never send identity, role, reviewer or status.

| Route | Purpose |
| ----- | ------- |
| `/admin` | Live counts (published/draft programs, students, active enrolments, submissions to review), recently updated programs, recent audit activity |
| `/admin/analytics` (+ programs, revenue, learning, certificates, operations) | Reports, charts, CSV exports and operational status ([analytics.md](analytics.md)) |
| `/admin/programs` | All programs with status filter |
| `/admin/programs/new` | Create a program (always saved as a draft) |
| `/admin/programs/[id]` | Edit details, publishing checklist, publish / archive / move to draft (confirmed) |
| `/admin/programs/[id]/modules` | Add, publish/hide and reorder learning modules |
| `/admin/programs/[id]/modules/[moduleId]` | Edit a module; add, edit, publish/hide and reorder its tasks |
| `/admin/submissions` | Review queue (pending first, oldest first), filters by status and program, 25 per page |
| `/admin/submissions/[id]` | Submitted work, instructions, criteria, all attempts; record a decision or update feedback |
| `/admin/students` | Search and paginate students; suspend or reactivate (reason + confirmation) |
| `/admin/enrollments` | Enrolments with status/program filters and progress; grant a manual (unpaid) enrolment |
| `/admin/payments` | Read-only payment records, filters, "needs attention", check with provider ([payments.md](payments.md)) |
| `/admin/certificates` (+ `/issue`, `/[certificateId]`) | Issue eligible certificates, download, correct and reissue, revoke ([certificates.md](certificates.md)) |
| `/admin/notifications` | Email outbox monitoring: status counts, failures, retry failed jobs, process now ([notifications.md](notifications.md)) |
| `/admin/audit-logs` | Append-only history, filter by action and record type |

## Programs

- **Price** is typed in rupees and converted with string/integer arithmetic to
  integer **paise** (₹99 → 9900, ₹0.29 → 29); negative or malformed values are
  rejected and nothing is saved.
- **Slugs** are normalised from the title when left empty, must be unique, and
  are **locked once a program has been published** (public links must not break).
- **Publishing** requires: at least one learning outcome and completion
  criterion, at least one published module, every published module has content
  or published tasks, every required task has instructions, and no required
  file task (uploads are unavailable). The same checklist protects a published
  program: edits, module/task hiding or task changes that would break it are
  refused and rolled back.
- **Status changes** (with confirmation): draft ↔ published ↔ archived. Archiving
  removes the program from the catalogue and new enrolment; enrolled students
  keep access. Moving a published program back to draft removes access until it
  is published again. Programs are **never deleted**.
- FAQ entries are kept on save (edit them through `npm run content:import`).

## Modules and tasks

- Modules and tasks keep stable ids, so edits never reset progress or
  submission history. Every lookup is scoped to the program (and module).
- Reordering renumbers positions 0…n−1 in a fixed sort order (deterministic).
- Content and instructions are Markdown rendered without HTML or scripts.
- File tasks cannot be created (no secure storage); a task's submission type is
  locked once students have submitted it.
- Changing whether a task is required, its completion rule or its publication
  updates enrolled students' progress immediately (the page warns how many are
  affected); progress snapshots are refreshed.

## Reviews

- Decisions: accept, request changes, reject, or mark as under review, following
  the allowed transitions. Feedback is **required** (10+ characters) to request
  changes or reject. Scores are optional whole numbers 0–100.
- Only the student's **latest** attempt can be decided; earlier attempts and their
  feedback are kept and shown.
- After a final decision, feedback and score can be corrected (audited as
  `submission.feedback_updated`); the decision itself cannot be reversed.
- Accepting work updates progress/eligibility only. Certificates are issued
  separately by an admin after a live eligibility check ([certificates.md](certificates.md)).

## Students and enrolments

- Lists show only what administration needs (name, email, dates, status,
  counts); never password hashes, session data or tokens. Search input is
  matched literally (escaped), and results are paginated.
- **Suspension** (student accounts only; admins use the CLI) needs a reason and
  confirmation, ends all the student's sessions immediately, is audited with the
  reason, and is reversible. Nothing is deleted.
- Enrolments and payments cannot be marked as paid by hand; paid enrolments come
  only from verified payments ([payments.md](payments.md)). A **manual enrolment** requires confirming
  that no online payment is involved; it is recorded with `source: manual` and
  `amountPaid: 0`, and audited with the administrator as actor.

## Audit log

Recorded with the acting admin (or "System" for the CLI) and non-sensitive
metadata: program created/updated/published/archived/unpublished, content
imported, module/task created/updated/reordered, submission reviewed and
feedback updated, role and account-status changes, enrolments created.
Entries are append-only and cannot be edited or deleted.

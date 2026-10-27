# Certificates

Certificates are issued, verified, revoked and corrected inside this app and
domain. MongoDB records are the source of truth; a PDF or QR code is only a
link to them.

## Eligibility

`checkCertificateEligibility()` in `src/lib/services/certificate-service.ts`
is the only eligibility check; the admin list and issuance both use it. It
reads trusted records and uses the same progress rule as the learning area
(`evaluateEnrollmentCompletion()` → `src/lib/learning/progress.ts`).

A certificate can be issued only when **all** of these hold:

1. The enrollment exists (and belongs to the expected student, when one is
   given).
2. The student account exists, is a student and is active.
3. The program exists and is published or archived (not draft).
4. The program has published completion criteria and at least one published
   module, and no required file-upload tasks (students can't submit those
   yet).
5. The enrollment is `active` or `completed`.
6. Every published module is complete:
   - required tasks are complete. Tasks with the `review` rule need an
     **accepted** review; `submission` tasks need a valid submission;
   - reading-only modules are marked as read.

   Optional tasks never count.
7. For paid enrollments (`source: payment`), the linked payment is still
   `paid` (not refunded). Manual enrollments were granted by an admin without
   payment. Nothing is charged twice.
8. No valid certificate exists for the enrollment, and none was revoked.
   Re-issuing after a revocation is deliberately not automatic.
9. The name and program title can be printed by the template (see Limitations).

Paying, enrolling or partially completing never earns a certificate. The browser
cannot send "eligible", an issuer or a status: the Zod schemas reject them.

## Issuing, revoking, correcting (admins)

| Route | Purpose |
| ----- | ------- |
| `/admin/certificates` | Search by certificate ID, student name or email; filter by status and program |
| `/admin/certificates/issue` | Enrollments with live eligibility and reasons; issue with confirmation |
| `/admin/certificates/[certificateId]` | Record, history, PDF download, correct and reissue, revoke |

- Every page calls `requireAdmin()`. Each Server Action re-checks the session.
  Each service re-checks that the actor is an **active** admin in the database.
- The issuer is the signed-in admin.
- **Issue:** eligibility is re-checked at the moment of issuance. Repeated or
  concurrent requests can't create a second certificate, because a unique
  partial index allows at most one `issued` certificate per enrollment. A
  refused attempt is audited as `certificate.issue_refused` with the reason
  codes.
- **Revoke:** needs a reason (10–500 characters) and confirmation.
  - It's a compare-and-set from `issued` to `revoked`, recording `revokedAt`
    and `revokedBy`.
  - Verification changes immediately.
  - The reason is internal and never shown publicly.
- **Correct and reissue:** for errors such as a misspelled name. Fix the profile
  name or program title first. Then:
  1. The old certificate is compare-and-set to `superseded`.
  2. A new certificate is created with a **new number and token**, the current
     name and title snapshots, and the **original completion date**.
  3. The two records are linked both ways.

  If step 2 fails, step 1 is reverted. The link is also derivable from the new
  record (`supersedesCertificateId`), so an interruption before step 3 loses
  nothing. Completion was verified at the original issuance, so later
  curriculum changes don't block a correction.
- Students can't issue, revoke or replace anything.
- Audit actions:
  - `certificate.issued`, `certificate.revoked`, `certificate.superseded`;
  - `certificate.issue_refused`;
  - `certificate.downloaded` (admin PDF downloads).

  Raw tokens are never logged.

## Certificate numbers

Format: `PREFIX-YEAR-SEQUENCE`, e.g. `GOL-2026-000001`.
- `PREFIX` is `brand.certificate.prefix` (2–6 capital letters).
- `YEAR` is the issue year in IST.
- `SEQUENCE` has at least six digits.

There's no per-program code, because programs have no reliable short-code
mapping.

The sequence comes from an atomic counter (`counters` collection, one
`findOneAndUpdate({$inc}, upsert)` per number). It never checks whether a
number exists before inserting. A unique index on `certificateId` backs it up;
on a collision the next number is taken. Numbers are never reused: a failed or
refused insert leaves a gap, which is expected. Database ids are never shown as
certificate numbers.

## Verification tokens and QR codes

- Each certificate has a separate token: **32 bytes from `crypto.randomBytes`**,
  base64url (43 characters). It is unrelated to the certificate number.
- The database stores a **SHA-256 hash** of the token, which is unique and
  used for lookups.
- The token is also stored **AES-256-GCM encrypted** with
  `CERTIFICATE_TOKEN_KEY`, so the identical QR code can be regenerated for the
  certificate's lifetime. A database leak alone reveals no working links.
- QR target: `${SITE_URL}/verify/<token>`. In production, issuing **requires an
  https `SITE_URL`**, so a development host is never printed.
- The QR uses error correction level M. It is about 39.5 mm square with the
  standard quiet zone, drawn as one vector path.
- It decodes reliably from rendered pages at 0.75×–4× scale (pdf.js render +
  jsQR, tested).

A QR code proves nothing by itself. The verification page reads the current
record.

## PDF

- Generated **on demand** with `pdf-lib` from the immutable record and its
  `templateVersion`. Nothing is stored, so there is no bucket to secure.
- Output is reproducible: metadata dates are the issue date.
- Layout: A4 landscape on an ivory page with a gold frame and "VERIFIED
  CERTIFICATE" micro-text bands. Logo, name and tagline top left; certificate
  ID and a "Verified Credential" badge top right; a faint logo watermark; then:
  - "Certificate / of completion" and the student name snapshot (serif,
    auto-sized, wraps to two lines);
  - the program title snapshot (up to two lines), followed by a fixed line
    on what was demonstrated (hands-on project tasks reviewed against the
    published completion criteria; a final project is not promised, since
    programs need not have one);
  - completion and issue dates (bottom left);
  - the brand seal, the QR code and "Scan to verify" (bottom right);
  - a footer with "Udyam-registered MSME" (no registration number, by the
    owner's choice), the `/verify` host and a line stating it is **not a
    degree, diploma or accredited qualification**.
- Every certificate renders with the current design, whatever template version
  it was issued under (the version is kept in the PDF metadata).
- The badge and the seal are the platform's own marks and print only on valid
  certificates. There are no signatures, logos of other bodies or invented
  people. A signatory prints only if `brand.certificate.signatory` is set to a
  real, authorised person.
- Fonts: Cormorant Garamond and Inter, trimmed to the certificate character
  set and embedded whole, from `src/lib/certificates/fonts` (SIL Open Font
  License; see the README and licence files there;
  bundled for the PDF route via `outputFileTracingIncludes` in next.config.ts).
- Download: `GET /api/certificates/:certificateId/pdf`.
  - Students get their own **valid** certificates only. Another student's is
    404; signed out is 401.
  - Admins can download any certificate; revoked and superseded copies are
    watermarked "NOT VALID". Admin downloads are audited.
  - Responses use `application/pdf`, `attachment; filename="GOL-….pdf"` and
    `private, no-store`.
  - If generation fails, an error is shown; nothing is re-issued.

## Public verification

- `/verify`: enter a certificate ID. Input is normalised; for example,
  `gol 2026 000001` becomes `GOL-2026-000001`. The result shows status, program,
  dates and the holder's **initials only**, because numbers are sequential and
  full names would be enumerable.
- `/verify/[token]` (the QR target): shows the full name, program and dates.
  - Rendered per request.
  - `noindex`, `no-referrer`.
  - Never publicly cached.
- States:
  - **valid**;
  - **revoked** (with date, no reason);
  - **replaced** (links the replacement only if it is itself valid);
  - **not found**;
  - **temporarily unavailable**: database errors are never shown as "invalid"
    or "not found".
- No emails, account ids, submissions or payment details are ever shown.
- Rate limit: 60 lookups per IP per 15 minutes (MongoDB-backed).

## Student pages

- `/student/certificates`: own certificates only, with status. "Download" only
  for valid ones.
- `/student/certificates/[certificateId]`:
  - Ownership is part of the database query.
  - Shows details, download and the shareable verification link, with a privacy
    note.
  - Revoked or replaced certificates stay visible with an explanation and are
    never presented as valid.

## Configuration

| Variable | Purpose |
| -------- | ------- |
| `CERTIFICATE_TOKEN_KEY` | 32 random bytes, base64. Required to issue and to regenerate PDFs. Back it up; losing it means existing PDFs can't be regenerated with their QR (verification keeps working). |
| `SITE_URL` | Must be the public **https** address in production (QR codes and printed host). |

`brand.certificate.prefix` and `brand.certificate.signatory` are in
`src/config/brand.ts`.

## Limitations / before launch

- **Names in non-Latin scripts** (e.g. Devanagari) can't be printed by the
  bundled fonts, which cover the same Western European character set as before.
  Issuance is refused with a clear reason. Supporting them needs a Unicode font with complex-script shaping, which pdf-lib does not do.
- `pdf-lib` 1.17.1 is stable but has had no release since 2021. Re-evaluate if
  maintenance matters.
- The certificate policy (`/certificate-policy`) is still a draft. Who may
  approve revocations, and any appeal process, are not decided yet.
- No emails are sent on issuance yet (Part 10).

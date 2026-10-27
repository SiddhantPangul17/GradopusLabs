# Gradopus Labs Platform

Affordable virtual project-based training. One Next.js application serves the
public website, student portal, admin dashboard, certificate generation and
verification, and backend API routes under a single domain.

**Status:** Part 11 (analytics). Public website, student accounts and learning area ([docs/learning.md](docs/learning.md)), admin dashboard ([docs/admin.md](docs/admin.md)), online payments with verified enrollment activation ([docs/payments.md](docs/payments.md)), certificates with PDF + QR verification ([docs/certificates.md](docs/certificates.md)), transactional emails and in-app notifications ([docs/notifications.md](docs/notifications.md)), and admin analytics, CSV reports and operational status ([docs/analytics.md](docs/analytics.md)). Payments and email are tested against simulated providers only and are **off** until configured. Seven policies are published from [docs/policies/](docs/policies/) (version 1.0, legal review pending, effective date not yet set); file uploads are clearly labelled as not available.

## Placeholders and temporary data

| Item | Where | Replace with |
| ---- | ----- | ------------ |
| Sample programs: **`next dev` without `MONGODB_URI` only**, labelled as samples; never used in production | `src/data/programs.ts` | Published programs in MongoDB (admin dashboard, later part); then delete the fixtures |
| Online payments (off until `PAYMENT_*` is set; test mode by default) | `src/lib/payments/`, [docs/payments.md](docs/payments.md) | Approved Razorpay account, live keys and webhook, approved refund policy |
| Refunds (model only; not implemented) | `src/lib/services/refund-service.ts` | Provider refund API + webhook confirmation |
| Contact form: emails messages to `brand.contact.email` via the email provider (sender as reply-to, 5 per IP per hour); nothing stored. Reports "not connected" until `EMAIL_*` is set | `src/app/(public)/contact/actions.ts` | Keep the support inbox monitored |
| Policy placeholders shown publicly as "To be confirmed" (timelines, per-program terms, decision-makers); legal review pending | `docs/policies/*.md` (rendered by `src/lib/policies/` and `src/components/layout/policy-page.tsx`) | Confirmed details and legally reviewed text; record each change in the file's revision history |
| Draft FAQ answers | `src/data/faqs.ts` (`draft: true`) | Final answers once policies are approved |
| Certificate signatory (none printed while `null`) | `brand.certificate.signatory` | A real, authorised person, if wanted |
| Public contact email: `support.gradopuslabs@gmail.com` (the proprietor's personal name and contact details are deliberately not published) | `src/config/brand.ts` | Change here if the support inbox changes |
| Emails (queued, not sent until `EMAIL_*` is set; dev prints reset links to the console) | `src/lib/email/`, [docs/notifications.md](docs/notifications.md) | Verified sending domain + provider key + scheduler (`CRON_SECRET`) |
| Email verification (not implemented; shown as "not verified") | `emailVerified` on users | Verification emails |
| File-upload tasks (shown as unavailable; server rejects them) | `src/lib/services/submission-service.ts` | Private object storage + signed URLs ([docs/learning.md](docs/learning.md)) |
| Manual enrollments (no payment recorded) | `/admin/enrollments`, `npm run enroll:student` | Kept for scholarships/testing |

Unknown program slugs return a real 404 via `src/proxy.ts`, which checks the
slug before rendering.

## Stack

- Next.js 16 (App Router, `src/` directory, Cache Components enabled)
- React 19, TypeScript (strict)
- Tailwind CSS 4
- MongoDB Atlas with Mongoose 9 (server-side only)
- Auth.js (next-auth v5, pinned beta) with email + password, Argon2id hashing
- Zod (environment and input validation)
- Vitest (+ mongodb-memory-server for database tests)

## Getting started

Requires Node.js 20.19 or later (Mongoose 9).

```bash
npm install
npm run dev        # http://localhost:3000
```

No environment variables are needed to run locally; without a database the
program pages show labelled sample data. To connect MongoDB Atlas, follow
[docs/database-setup.md](docs/database-setup.md):

```bash
cp .env.example .env.local
```

Other scripts:

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm test           # unit tests (no database needed)
npm run test:db    # integration tests against a throwaway MongoDB
npm run build      # production build (reads MongoDB if MONGODB_URI is set)
npm run start      # serve the production build
npm run admin:list | admin:grant | admin:revoke   # manage administrators (docs/authentication.md)
npm run content:import -- --file program.json      # add/update a program and its modules (docs/learning.md)
npm run enroll:student -- --email … --program …    # manual enrollment until payments exist
```

`GET /api/health` reports `{ status, database }` with `database` one of
`connected`, `not_configured` or `unavailable` (HTTP 503).

## Data layer

- `src/lib/db/mongodb.ts`: one cached Mongoose connection per server process
  (survives dev hot reloads); errors never include credentials or hostnames.
- Learning: `LearningModule`, `LearningTask`, `Submission` (one document per
  attempt) and `LearningProgress`; progress/eligibility rule in
  `src/lib/learning/progress.ts` (see [docs/learning.md](docs/learning.md)).
- `src/models/`: `Program`, `User`, `Enrollment`, `AuditLog` schemas with
  validation and indexes (unique slug, unique lowercased email, one
  pending/active enrollment per student and program, append-only audit log).
- `src/lib/validation/`: Zod schemas for untrusted input (public schemas reject
  `role`, `accountStatus` and unknown fields).
- `src/lib/services/`: server-side queries and mutations that return plain,
  safe objects (no raw documents, no `passwordHash`). `createProgram` is
  admin-only and audited; no mutation is exposed through a route yet.
- `src/lib/programs.ts`: what pages use. Cached (`"use cache"`, tag `programs`)
  and published-only; source selection is in `src/lib/program-source.ts`.

## Project structure

```text
src/
  app/                  Routes (App Router)
    layout.tsx          Root document: <html>, metadata, brand CSS variables, skip link
    globals.css         Design tokens, type scale, base styles
    not-found.tsx       404 page
    (public)/           Public website (URL unaffected by the group name)
      layout.tsx        Shared header, <main>, footer
      error.tsx         Error boundary for public pages
      page.tsx          Homepage
      programs/         Listing and programs/[slug] details (+ not-found)
      about/ contact/ faq/
      privacy/ terms/ refund-policy/ certificate-policy/ internship-policy/ assessment-policy/ intellectual-property/   Policy pages rendered from docs/policies/*.md
      verify/ login/ student/   Placeholder routes
    admin/              Admin area with its own minimal layout (placeholder)
  components/
    layout/             PageContainer/PageSection, SiteHeader, SiteNav (client),
                        SiteFooter, BrandLogo, CurrentYear, PlaceholderPage,
                        PolicyLayout/ReviewNote
    programs/           ProgramCard, ProgramGrid, EnrollmentPanel, fixture notice
    sections/           HeroIllustration, FaqList/FaqItem, CtaSection
    forms/              ContactForm (client)
    ui/                 Button/ButtonLink, Card, SectionHeading, StatusBadge,
                        Notice, EmptyState, FactList, form fields, icons
  config/
    brand.ts            Brand name, copy, logo, contact, colours, pricing defaults
    navigation.ts       Header and footer links
  data/
    programs.ts         DEVELOPMENT FIXTURES (sample programs)
    faqs.ts             FAQ content
  lib/
    env.ts              Server-only environment validation (Zod)
    constants.ts        Shared enums (statuses, roles) for models, validation and UI
    db/mongodb.ts       Cached MongoDB connection + health check
    services/           Program, enrollment, user and audit-log services
    validation/         Zod input schemas
    programs.ts         Public program data access (cached, published only)
    program-source.ts   Database vs development fixtures; slug check for Proxy
    program-display.ts  Labels and formatting for programs
    contact-form.ts     Contact form limits and result types
    errors.ts           Typed service errors
    seo.ts              Canonical URLs (only when SITE_URL is set)
    utils.ts            Small shared helpers
  models/               Mongoose models
  app/api/health/       GET /api/health
  proxy.ts              Returns 404 for unknown program slugs
  types/                Shared TypeScript types
tests/                  unit/ and integration/ (Vitest)
docs/                   database-setup.md
public/
  images/               Logo and imagery
  icons/                Icon assets
```

## Rebranding

Edit `src/config/brand.ts` and replace `public/images/logo.svg`. Colours in
`brand.theme.colors` are injected as CSS variables and exposed to Tailwind as
`bg-primary`, `text-muted`, `border-border`, etc. (see `src/app/globals.css`).

## Design system

Use semantic tokens and the shared components; avoid raw colour values.

- **Colour utilities:** `primary`, `primary-strong`, `on-primary`, `secondary`,
  `secondary-foreground`, `background`, `surface`, `foreground`, `muted`,
  `border`, `border-strong`, `ring`, `success`, `info`, `warning`, `error`
  (e.g. `bg-surface`, `text-muted`, `bg-success/10`).
- **Type scale:** `type-display`, `type-page-title`, `type-section-title`,
  `type-card-title`, `type-lead`, `type-body`, `type-supporting`, `type-label`,
  `type-button`, `type-meta`, `type-eyebrow`. Uses the system font stack.
- **Shape:** `rounded-control` (buttons, inputs), `rounded-card`;
  `shadow-card`, `shadow-raised`; 1px borders.
- **Layout:** `PageContainer` (`max-w-page` 72rem or `max-w-narrow` 48rem,
  16/24/32px side padding) and `PageSection` (48/64/80px vertical rhythm).
- **Focus:** a 2px `ring`-coloured outline is applied globally on `:focus-visible`.

```tsx
<PageSection labelledBy="faq-heading" tone="muted">
  <SectionHeading id="faq-heading" eyebrow="Help" title="Questions" action={{ label: "Contact", href: "/contact" }} />
  <Card elevated>
    <CardHeader><CardTitle>Title</CardTitle><CardDescription>Text</CardDescription></CardHeader>
    <CardFooter><StatusBadge status="pending">Payment pending</StatusBadge></CardFooter>
  </Card>
  <ButtonLink href="/programs">Explore</ButtonLink>
  <Button variant="outline" loading loadingText="Saving…">Save</Button>
  <TextField id="email" type="email" label="Email" hint="We never share it." error={errors.email} required />
</PageSection>
```

## Environment variables

See `.env.example`. All variables are server-only.

| Variable      | Required from         | Purpose                                        |
| ------------- | --------------------- | ---------------------------------------------- |
| `SITE_URL`    | Any deployment        | Canonical URL for metadata and absolute links  |
| `MONGODB_URI` | Production (now)      | MongoDB Atlas connection string                |
| `MONGODB_DB_NAME` | Optional          | Database name (default `krushitech`)           |
| `AUTH_SECRET` | Accounts (now)        | Session cookie encryption secret (32+ characters) |
| `AUTH_TRUST_HOST` / `AUTH_URL` | Production | Required by Auth.js outside development  |
| `ADMIN_EMAIL` | Optional              | Default account for `npm run admin:grant`      |
| `PAYMENT_PROVIDER` / `PAYMENT_MODE` | Payments | `razorpay`; `test` (default) or `live` ([docs/payments.md](docs/payments.md)) |
| `PAYMENT_KEY_ID` / `PAYMENT_KEY_SECRET` / `PAYMENT_WEBHOOK_SECRET` | Payments | Gateway keys and webhook secret (server only) |
| `EMAIL_PROVIDER` / `EMAIL_API_KEY` / `EMAIL_FROM` / `EMAIL_REPLY_TO` | Email | Transactional email ([docs/notifications.md](docs/notifications.md)) |
| `CRON_SECRET` | Email | Bearer secret for the scheduled outbox processor |
| `CERTIFICATE_TOKEN_KEY` | Issuing certificates | Encrypts stored verification tokens ([docs/certificates.md](docs/certificates.md)) |

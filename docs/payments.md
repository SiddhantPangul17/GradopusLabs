# Online payments

Students pay for a published program at `/checkout/[programSlug]`; their
enrolment is activated only after the payment provider has confirmed the
payment on the server. Everything runs inside this Next.js app and domain.

**Status:** implemented and tested against a **simulated** Razorpay API, using
locally signed requests and fake test keys. It has **not** been run against the
Razorpay sandbox or live mode. Live payments are blocked until the launch
checklist below is complete.

## Provider

The code talks to a provider-independent interface (`src/lib/payments/types.ts`).
Razorpay is the only implementation (`src/lib/payments/razorpay.ts`, documented
REST API via `fetch`, no SDK). Razorpay supports Indian payment methods (UPI,
cards, net banking, wallets). It needs an **approved merchant account** for live
payments; fees and KYC requirements are set by Razorpay and change over time, so
check its current pricing and onboarding terms. Test mode works without approval.

To add another gateway, implement `PaymentProvider` and add its name to
`PAYMENT_PROVIDERS`. Checkout, activation and webhook handling do not change.

## Configuration

| Variable | Purpose |
| -------- | ------- |
| `PAYMENT_PROVIDER` | `razorpay`, or empty to switch online payments off |
| `PAYMENT_MODE` | `test` (default) or `live` |
| `PAYMENT_KEY_ID` | API key id (public; sent to the browser for Checkout) |
| `PAYMENT_KEY_SECRET` | API key secret (server only) |
| `PAYMENT_WEBHOOK_SECRET` | Webhook secret you choose in the dashboard (server only, different from the key secret) |

- Payments are **off** unless all four values are set and consistent.
- Keys alone never enable live mode. Live payments need `PAYMENT_MODE=live`
  **and** `rzp_live_…` keys. Test keys in live mode, or live keys in test mode,
  disable payments and log a configuration error (names only, never values).
- Use separate test and live keys per environment. Never put live keys in
  development, never commit them, and never give a payment variable a
  `NEXT_PUBLIC_` prefix (a unit test enforces this).
- Every payment record stores its `mode`, so test and live records never mix.
- The program page enables "Enrol" only when payments are configured. It is
  prerendered, so **redeploy** after changing payment variables.

### Razorpay dashboard setup (test mode first, then live)

1. Generate API keys (Settings → API Keys) for the mode.
2. **Payment capture:** enable automatic capture. Authorized-but-uncaptured
   payments are shown as "Awaiting confirmation" and grant no access.
3. **Webhook** (Settings → Webhooks):
   - URL: `https://<SITE_URL host>/api/webhooks/payment`. HTTPS on port 443;
     localhost cannot receive webhooks.
   - Secret: the value of `PAYMENT_WEBHOOK_SECRET`.
   - Active events: `payment.captured`, `order.paid`, `payment.failed`,
     `payment.authorized`.
   - Set an alert email address.
4. Configure test-mode and live-mode webhooks separately, each with its own
   secret.
5. If your host has a firewall, allow Razorpay's webhook IPs (listed in their
   docs).

## Flow

1. **Checkout page** (`/checkout/[slug]`, students only):
   - Reads the program, the price and any existing enrolment from the database.
   - Shows the program fee as the amount payable. No taxes, discounts or fees
     are invented.
   - Links the **draft** refund policy and terms.
   - Viewing or refreshing it never creates an order.
2. **`POST /api/payments/create-order`** with `{ programSlug }` and nothing else.
   Any other field (amount, price, currency, discount, student, status) is
   rejected. The server then:
   - Checks that the student is active, the program is published and open, and
     the student isn't already enrolled.
   - Inserts a local `Payment` (`created`, with a random idempotency key).
   - Creates the Razorpay order with the database price, using the idempotency
     key as `receipt`.
   - Returns only public checkout options.

   While an order is still open, repeat calls (refresh, double click, a second
   tab) resume it. A database index allows one open payment per student and
   program, so a second order is never created.
3. **Browser:** opens Razorpay Checkout and posts what it returns to
   **`POST /api/payments/verify`**. The server then:
   - Checks the signature: `HMAC_SHA256(our order_id + "|" + payment_id,
     key_secret)`, compared in constant time.
   - Fetches the payment from Razorpay.
   - Applies it only if the order id, amount and currency match.

   If Razorpay can't be reached, the payment stays **pending**.
4. **Webhook** (`POST /api/webhooks/payment`):
   - Checks `X-Razorpay-Signature` over the exact raw body before anything else.
   - Drops duplicates by `x-razorpay-event-id`. Processed ids are stored in
     `webhook_events`, without payloads.
   - Matches the local payment by order id and checks amount and currency.
   - Replies within Razorpay's 5-second window. 2xx means handled or
     deliberately ignored, 400 means a bad signature or body, and 409/5xx are
     temporary so Razorpay retries (it retries for up to 24 hours).
5. **Result** (`/checkout/[slug]?payment=…`):
   - Shows only what the server knows: paid and enrolled, awaiting
     confirmation (auto-updates, "Check payment status"), not completed, or
     failed/cancelled (retry).
   - Reading it never creates orders.

A payment never becomes `paid` because the browser shows success, a success
URL is visited, a payment id is submitted, or a client sends `status: "paid"`.

### States and ordering

`created → pending/authorized → paid`, plus `failed` and `cancelled`. Refund
states (`refund_pending`, `refunded`, `partially_refunded`) are reachable only
from `paid`. Rules are in `src/lib/payments/state.ts`; every change is a
compare-and-set.

- A late `payment.failed` or `payment.authorized` never reverses `paid`.
- A verified capture after a failure still counts. Razorpay allows another
  attempt on the same order, and a UPI payment can succeed after being reported
  as failed.

### Enrolment activation

After a verified capture the payment is marked `paid`, then exactly one
`active` enrolment is created (`source: "payment"`, `amountPaid`, `paymentId`)
and linked. Both steps are audited.

There are no multi-document transactions. Safety comes from:
- compare-and-set updates;
- a unique index on `enrollment.paymentId`;
- the one-current-enrolment index;
- a recovery step. A paid payment without an enrolment is completed on the
  next webhook retry, verify call or reconciliation.

No route activates an enrolment from an enrolment id.

**Policy: program unavailable at confirmation.** If the program has been
unpublished or archived when payment is confirmed:
- the payment stays `paid` (money was taken);
- **no access is granted**;
- it is flagged `program_unavailable` for an administrator, who handles the
  refund or follow-up.

Paying while already enrolled is flagged `already_enrolled` (possible
duplicate). Programs that are published but closed to new enrolment still
activate orders started while enrolment was open.

## Student and admin views

- `/student/payments`: the student's own payment records, paginated. It never
  infers payments from enrolments; manual enrolments have no payment. Pending
  is never labelled paid.
- `/admin/payments`: read-only, with filters (status, "needs attention", mode,
  program).
  - There is **no way to set a status**.
  - "Check with provider" fetches the order's payments from Razorpay and
    applies them with the webhook rules. It is audited as `payment.reconciled`.
- Audit actions:
  - `payment.order_created`, `payment.paid`, `payment.authorized`,
    `payment.failed`, `payment.cancelled`;
  - `payment.verification_failed`, `payment.needs_attention`,
    `payment.reconciled`;
  - `enrollment.created` (source payment).

  Metadata never includes secrets, signatures or card/UPI data.

## Stored data

`Payment` stores:
- student, program and enrolment ids;
- provider, mode, provider order and payment ids;
- amount (integer paise) and currency;
- status, failure code, attention reason, how it was verified;
- timestamps.

It does not store card numbers, CVV, UPI ids or PINs, provider contact details,
or raw payloads; the parser drops them. Records are never deleted.

## Refunds: not implemented

`Refund` model and `src/lib/services/refund-service.ts` define the future
workflow. Refunds:
- are separate records with their own status;
- are created through the provider's refund API;
- are marked processed only after provider confirmation.

Changing a database status never simulates a refund. Today, refunds made in the
Razorpay dashboard are **not** reflected in the platform. Access isn't withdrawn
automatically; an administrator must follow up.

## Launch checklist (blockers for live payments)

- [ ] Razorpay merchant account approved for live mode (KYC, business details, website review).
- [ ] Live keys and a live webhook (with its own secret) configured; `PAYMENT_MODE=live` set deliberately.
- [ ] **Refund policy approved** and published (it is a draft), along with terms and privacy policy.
- [ ] A monitored contact address configured (`brand.contact.email`) for payment problems.
- [ ] End-to-end test in Razorpay **test mode** on a deployed HTTPS URL: success, failure, UPI retry, webhook delivery, duplicate delivery.
- [ ] Decide tax/GST treatment and invoicing with an accountant; nothing is shown or calculated today.
- [ ] A process for `needs attention` payments and dashboard refunds.

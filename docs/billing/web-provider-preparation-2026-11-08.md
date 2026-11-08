# Paystack and Polar preparation — 8 November 2026

Source preparation only. No active checkout, provider setting, financial account,
credential, subscription grant, schema, deployment or customer payment changed.

## Recovered owner decisions

- Paystack for Nigeria; Polar for other mapped, supported billing territories.
  The owner explicitly confirmed Polar in this chat.
- Reuse the [existing commercial policy](mobile-free-launch-2026-11-06.md):
  monthly payment in advance, owner pays, no staff subscriptions, trial or annual
  offer. The free-first launch section is superseded by the paid-launch correction.
- Nigeria: Starter NGN5,000, Growth NGN15,000, Pro NGN30,000 per month.
  Other Africa uses comparable baseline prices. Outside Africa uses the20%
  reference increase: NGN6,000/18,000/36,000. These references do not assert a
  current FX quote or a USD/EUR charge. The existing plan expressly requires
  provider-specific final prices; Apple store rounding is not a Polar price table.
- The October $9/$29/$79 international hypothesis is historical and unapproved;
  it is not used. No new pricing confirmation is needed from the owner.

## Prepared source

`@ewatrade/payments/web-subscriptions` owns these server-only building blocks:

- Pure regional NGN references and explicit territory/product/currency/minor-unit
  mappings. Nigerian amounts are fixed to the approved offer. A mapping cannot
  mix Africa and international references, use a country wildcard, duplicate a
  plan/territory or route Nigeria to Polar. It rejects unknown countries and
  malformed configuration. A territory input is a verified billing context
  contract; it does not authorize using an editable business country, IP or GPS.
- Paystack reads the actual saved plan and checks monthly billing, NGN amount,
  test/live mode and invoice limit before initializing recurring hosted checkout.
  Its stable reference and metadata bind the server checkout/account IDs. Only
  Paystack's HTTPS checkout host is accepted.
- Polar reads the actual product and checks one active fixed monthly price,
  amount/currency and archive state. Requests pin `Polar-Version: 2026-10`, disable
  trials and discounts, set the configured currency and opaque external owner ID,
  and validate the returned offer, owner, metadata and expiry before returning
  the environment-specific hosted checkout URL. No invented foreign price is
  activated: the USD values in tests are explicitly transport fixtures.
- Both clients bound request time, reject redirects and never automatically
  redispatch a failed/uncertain POST. Ambiguous outcomes require reconciliation
  by the eventual durable command; the client is not an idempotency ledger.
- Paystack raw-body SHA-512 signature authentication and Polar Standard Webhooks
  authentication with its five-minute timestamp window. New Polar-generated
  secrets use Standard Webhooks. Legacy/custom secrets require the explicit
  legacy format; there is no unsigned JSON fallback. This adapts the current
  provider contract rather than copying Midday's older SDK secret conversion.

`WEB_BILLING_ENABLED`, `WEB_BILLING_ENVIRONMENT`, `WEB_BILLING_PRODUCTS`,
`PAYSTACK_SECRET_KEY`, `POLAR_ACCESS_TOKEN` and `POLAR_WEBHOOK_SECRET` are the
prepared configuration names. Common enablement also requires the existing
owner switch and matching owner/store environment; sandbox is refused in a
Production app. These helpers are not imported by active API routes: setting
them alone does not activate website subscriptions. No fake provider fallback.

The package declares direct dependencies on already-locked Zod and
standardwebhooks1.1.1; no existing dependency version changed. No native billing
or existing hosted customer-collection adapter was modified.

## Read-only Polar account finding

The existing Chrome login opens `Zeroes and One Hi-Tech`. Its active catalog
shows five AfterService products and no active EwaTrade product. The organization
menu exposes that organization, New Organization, Sandbox and Logout. Overview
shows4/7 setup steps complete, with Connect a payout account next. This is a
point-in-time read, not a declaration that an archived/sandbox EwaTrade product
cannot exist. No account, payout setup, product, key or webhook was created or
changed; no other product was repurposed and no secret was read/exported.

## Remaining implementation and acceptance

This module does **not** provide payable dashboard subscriptions by itself.
Still required: EwaTrade-specific provider products/secure account configuration;
durable owner-bound checkout sessions and unknown-outcome recovery; signed paid
receipt processing; explicit owner business coverage; renewal/failure/cancel/
expiry/refund/replay handling; subscription management/return state; and sandbox
money, wrong-owner, price/currency, concurrency and native conflict acceptance.
The existing canonical owner-billing commands/readers must remain authoritative.
Live activation and deployment retain their prior approval boundaries.

Overall task milestones remain audit, direct checkout, focused verification and
provider setup/acceptance. Audit + focused local verification are2/4 (50%), not
test coverage or paid acceptance. Provider selection and existing price policy
are now resolved; source preparation is partial progress toward direct checkout.

## Verification

- Offline doctor passes; no database/provider connection in that check.
- Focused tests:24pass/155assertions across the new module and existing hosted
  payment adapter. Price policy, territory selection, saved-product mismatch,
  owner/price/expiry response binding, transport failures and both Polar secret
  formats exercise actual exported paths. Provider HTTP is stubbed, not live.
- The initial full payments TypeScript run reproduced four existing fetch-fixture
  cast errors in `paystack-banking.test.ts`. A typed mock helper now supplies Bun's
  `fetch.preconnect` method on those stubs, retaining every existing assertion.
  Full payments TypeScript passes; no cast-to-unknown or compiler relaxation.
- Full payments suite:74pass/503assertions across10files, with no live effects.
- Final fast checks, source hashes and assistant impact are recorded in
  `docs/verification/2026-11-08-web-provider-preparation.md`.
- No application UI changed in this slice. The earlier billing navigation/browser
  evidence is retained separately; this source preparation is not a second UI pass.

## Primary contract references

- [Paystack initialize transaction](https://paystack.com/docs/api/transaction/)
  and [subscriptions](https://paystack.com/docs/payments/subscriptions/).
- [Polar checkout creation](https://polar.sh/docs/api-reference/2026-10/checkouts/create-checkout-session)
  and [API versioning](https://polar.sh/docs/api-reference/versioning).
- [Polar webhook signing schemes](https://polar.sh/docs/integrate/webhooks/delivery).
- [UN M49 geographic regions](https://unstats.un.org/unsd/methodology/m49/)
  for the country/area grouping used by the pure reference helper.

Brain: subscription feature, in-progress task and provider/pricing decision
updated locally. Assistant billing remains form-only; no capability, procedure,
permission, model input or purchase authority was added.

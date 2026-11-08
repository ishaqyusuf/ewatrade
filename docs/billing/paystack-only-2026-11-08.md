# Paystack-only web subscriptions — 8 November 2026

Owner decision: drop Polar from EwaTrade web subscriptions. Use Paystack for
Nigeria and international customers. The Zenith USD domiciliary account can be
set up later. This supersedes the provider selection in
[the preparation packet](web-provider-preparation-2026-11-08.md), not the approved
monthly regional pricing or the separate native Apple/Google purchase channels.
No Polar organization/product/account was deleted or changed.

## Charge and settlement policy

- Nigeria: Starter NGN5,000 / Growth NGN15,000 / Pro NGN30,000 per month.
- Other Africa: comparable approved base; the NGN checkout uses that same reference.
- Outside Africa: +20%, NGN6,000 / NGN18,000 / NGN36,000 per month for the NGN route.
- Foreign cards can pay an NGN checkout when Paystack approves international
  payments; their bank performs conversion and the merchant settles in NGN.
- Actual USD charging/settlement stays unavailable until a Zenith USD domiciliary
  account is approved by Paystack and the explicit USD offer mapping is approved.
  There is no automatic FX quote or invented dollar price in source/config.
- Paystack is used as a gateway. This change does not provide Polar's international
  sales-tax service. Staff never purchase separately; owner coverage remains1/3/10
  separate businesses with the existing per-business limits.

## Implemented source

The existing Dashboard checkout mutation is now OWNER-only and creates a Paystack
monthly card checkout. Actual saved plan currency, amount, interval, environment
and unlimited invoice count are checked before initializing. The server resolves
opaque owner account, reviewed territory and product; editable business country,
IP/GPS/locale and request-supplied prices are not billing authority.

The same owner advisory lock reserves one dispatch across all their businesses.
A ready attempt resumes its original hosted URL; preparing/uncertain attempts block
another payment. An unknown POST outcome is retained for verification instead of
retrying. Definite rejections can be retried as a fresh attempt. The check-payment
button verifies the stored reference; callback query strings never grant access.

`POST /api/billing/webhooks/paystack` authenticates bounded exact raw bytes with
HMAC-SHA512 before parsing. It verifies paid transactions with Paystack before
recording an owner purchase/period. `subscription.create` binds a verified
subscription to a unique paid checkout; invoices can renew only that binding and
payer. A failed invoice never extends a paid period; non-renewal retains access
only until its paid expiry. Full processed refunds revoke the matching current
paid order, retain an early-refund tombstone and prevent replay. An older refund
cannot cancel a newer paid renewal. Partial refunds require operator review.

The new owner journal is a namespaced, Tenant-less `BillingProviderEvent` with
status PROCESSED (a checkout snapshot, not an unprocessed incoming event). It is
written atomically with its compatibility `BillingCheckoutSession` projection.
It survives that projection's Tenant cascade. Paid reconciliation checks the
immutable account owner, independently of the initiating business's later closure.
No schema/migration is needed. Provider OTHER is mapped to Paystack only in the
owner-billing adapter; `owner-paystack-*` namespaces separate checkout, binding,
charge and refund records from existing Tenant billing providers.

Owner grants use the existing canonical subscription, coverage and entitlement
readers. Applying a paid plan to a business is an explicit Dashboard action through
`storeSubscriptions.enrollBusiness`; payment/webhook replay cannot re-enroll a
released business. Existing store subscriptions block another checkout; pending
web reservations and Paystack owner receipts also block conflicting native receipts.
Legacy grants and native purchasing activation are not migrated or enabled.

The Dashboard retains errors, displays configured currency/monthly prices, checks
payment status and opens an owner-only hosted management link. Existing-data QA
cannot dispatch provider subscription operations. Assistant coverage stays form-only
for all checkout/check-payment/management/coverage actions; no assistant purchase
or provider credential authority is added.

## Configuration still required, outside source verification

No payment key, product, webhook, country binding, feature flag or deployment was
changed by this implementation. Do not treat the source as a working live checkout.

1. Supply the EwaTrade Paystack test secret through the private environment path.
   Do not send it in chat. Keep sandbox/test and Production/live keys separate.
2. Create/map the actual monthly Paystack plans. Nigeria/Africa and outside-Africa
   NGN prices require separate saved prices; no reused AfterService/Polar catalog.
3. Review owner billing territories, then set `WEB_BILLING_OWNER_COUNTRIES` to a
   JSON object mapping existing opaque OwnerBillingAccount UUIDs to verified ISO
   countries. Missing/unverified territory refuses checkout rather than defaulting
   to the Nigerian discount. This is an operator-managed initial binding, not a
   user-editable discount switch.
4. Set `WEB_BILLING_PRODUCTS` to explicit objects with provider `paystack`, planId,
   actual `PLN_` productId, currency, amountMinor, referenceNgnMinor and countries.
   For NGN, amountMinor must equal the approved regional reference. Duplicate,
   unknown or mixed-price mappings refuse. Do not include USD products yet.
5. Sandbox requires `WEB_BILLING_ENVIRONMENT=sandbox`, matching
   `STORE_BILLING_ENVIRONMENT=sandbox`, `OWNER_BILLING_ENABLED=true`, the matching
   `sk_test_` key and `WEB_BILLING_RETURN_URL=https://<dashboard>/settings/billing`.
   New checkout additionally requires `WEB_BILLING_ENABLED=true`; foreign owner
   countries additionally require `PAYSTACK_INTERNATIONAL_ENABLED=true` only
   after Paystack approves that capability. Existing receipt processing remains
   available when the new-checkout switch is turned off. Production refuses
   sandbox keys/environment and additionally requires `WEB_BILLING_RELEASE_APPROVED=true`
   only after the outstanding paid-launch acceptance, plus its reviewed release.
6. Configure the Paystack webhook to the matching API's
   `/api/billing/webhooks/paystack`. Check whether this merchant account/key is
   shared with domain/prescription payments before replacing any existing webhook:
   their existing receiver routes are separate and were not repointed here.
7. Accept the sandbox hosted checkout, webhook ordering/renewal/refund/card-update,
   real database concurrency, permissions and return/coverage UI before live use.
   Chargeback/dispute handling, verified failure courtesy, partial-refund review,
   uncertain-outcome/operator recovery and shared-key webhook routing require
   explicit acceptance before a paid launch; ordinary source smoke is insufficient.
8. Later: open/approve the Zenith USD account, confirm the actual currency offers,
   then add the USD mapping and set `PAYSTACK_USD_ENABLED=true` for that environment.
   The USD flag alone does not invent a plan or change an existing NGN subscription.

The provider/hosted/native acceptance gates stay open. There was no charge,
provider financial setup, feature activation, push, merge or deployment.

## Primary references

- [International payments, NGN conversion and Zenith USD requirement](https://support.paystack.com/en/articles/2130690).
- [Monthly plans and subscription events](https://paystack.com/docs/payments/subscriptions/).
- [Verify transaction](https://paystack.com/docs/api/transaction/).
- [Webhook signatures and retries](https://paystack.com/docs/payments/webhooks/).
- [Subscription management link](https://paystack.com/docs/api/subscription/).
- [Refund verification](https://paystack.com/docs/api/refund/).

Source verification and limits: [receipt](../verification/2026-11-08-paystack-only.md).

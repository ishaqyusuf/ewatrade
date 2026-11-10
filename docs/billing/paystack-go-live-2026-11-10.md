# Paystack website activation — 10 November 2026

Status: source and test catalog prepared; hosted checkout is not accepted or live.
Use Paystack only. Keep the approved regional prices; USD settlement is deferred.
This is a concrete setup plan, not permission to deploy or activate a provider.

## What the owner needs to do

1. Complete the EwaTrade merchant's registered-company compliance in Paystack.
   The 10 November browser check still shows Test Mode, Starter Business and
   0 of 5 sections complete. Use EwaTrade as trading name and
   ZEROES AND ONE TECH HUB NIG LIMITED as legal company (match the CAC documents).
   Select Registered Business and the actual incorporation/ownership structure.
   Paystack's Nigerian incorporated-company list includes incorporation/registration
   documents, memorandum/articles, TIN, director/beneficial-owner details and proof
   of address; the exact list depends on incorporation date and structure.
   Complete director identity/BVN consent directly in Paystack/iGree. Do not send
   ID documents, bank details, BVN, passwords, OTPs or API keys in chat.
2. Add the corporate NGN settlement account whose name matches the company
   registration. Supply the actual staff-size band, annual projected sales,
   support/disputes email, business phone and registered/operating addresses.
   The agent has not guessed these facts or submitted an account/agreement.
   Review and accept Paystack's service agreement and submit activation yourself.
3. After activation, request international payments if not already approved.
   Confirm the Accept international payments preference after Paystack approves it.
   Foreign cards may pay NGN with their bank's conversion. Actual USD payouts
   require the separately deferred Zenith USD domiciliary account; it is not
   needed for the initial NGN route.
4. When the isolated Preview checkout is ready, complete one Paystack Test Mode
   checkout directly in the browser using Paystack's published test-payment flow.
   The agent does not submit a payment. Keep actual live-card details out of QA.

No price information needs to be resupplied. Existing approved monthly charges:

| Territory | Starter | Growth | Pro |
| --- | ---: | ---: | ---: |
| Nigeria / other supported Africa | NGN 5,000 | NGN 15,000 | NGN 30,000 |
| Other supported countries | NGN 6,000 | NGN 18,000 | NGN 36,000 |

A useful business-description draft (review for accuracy before submission):

> EwaTrade provides subscription software for business owners to manage products,
> services, inventory, orders, staff, customer records, reports and online
> storefronts. We charge monthly software subscription fees.

## Test account decision

The owner confirmed Nigeria and directed use of an existing QA account instead
of creating a new account. The normal Preview QA chooser is signed into Bola Pilot,
OWNER of Bola Laundry Pilot under the existing managed QA domain. The attempted
new signup was stopped before the agent submitted verification; no new account,
fixture, paid grant or coverage was created by this work. Keep Production's
existing Apple reviewer session and purchase chain separate.

QA admission is not authority to run live provider actions. A new default-off
Paystack subscription test adapter selects only these exact server procedures:

- retailOps.createSubscriptionCheckoutIntent
- retailOps.checkWebSubscriptionPayment
- retailOps.manageWebSubscription

It requires the existing server-validated QA session scope, matching local/local
or preview/preview APP_ENV/DEV_PROFILE, a configured sandbox receiver, scoped
sk_test_ credential, and PAYSTACK_QA_SUBSCRIPTIONS_TEST_ADAPTER_ENABLED=true.
Production, ordinary sessions without QA scope, native purchase verification,
refunds, domain operations and unlisted paths retain their existing restrictions.
The actual controller still checks OWNER, legal acceptance, billing country,
saved plan and provider/domain facts. This is a real Paystack Test Mode adapter;
it does not fabricate paid receipts or grant access from callback parameters.

## Technical work owned by the implementation/release coordinator

- Include the committed receiver/QA/error fixes in a coherent candidate and clear
  its shared assistant/release gates. Run the existing Preview release and matched
  existing-data smoke; no unrelated mobile build or Production change is implied.
- Install the scoped existing EwaTrade test key and six verified test products
  privately into the API Preview target. Keep generic payment credentials separate.
  Confirm provider merchant 2096714, test domain, monthly NGN amount and unlimited
  invoices before opening a checkout. None of this secret data goes into Git/chat.
- Coordinate owner/store reader settings with the Apple release owner. Paystack
  needs OWNER_BILLING_ENABLED=true and STORE_BILLING_ENVIRONMENT=sandbox on Preview;
  it does not require enabling native purchases. Do not change Production reviewer
  configuration or infer Preview readiness from Production reader acceptance.
- Resolve the selected QA owner's opaque OwnerBillingAccount through the canonical
  flow, then bind its reviewed billing country NG. The account/territory mapping
  has not been invented. A missing mapping refuses payment; do not switch on a
  default Nigerian discount for arbitrary owners. Broader self-service rollout
  requires an operational verified-country enrollment policy.
- Set WEB_BILLING_ENVIRONMENT=sandbox, WEB_BILLING_RETURN_URL to
  https://preview-dashboard.ewatrade.com/settings/billing, and the validated six
  WEB_BILLING_PRODUCTS. Start with new checkout and receiver disabled. Keep USD,
  international and release-approval switches off for the Nigerian first test.
- Configure only EwaTrade's matching Test webhook at
  https://preview-api.ewatrade.com/api/billing/webhooks/paystack after verifying
  that the candidate can process authenticated receipts. Do not overwrite a
  different merchant or existing domain/collection receiver.
- Enable the reviewed Preview receiver and QA test adapter, then new checkout.
  Accept the hosted test return, independently verified signed receipt, one owner
  paid period, explicit business coverage, replay/ordering, cancellation/card
  management, failure/recovery/refund and real database concurrency. Source fixtures
  alone do not close these money/lifecycle requirements.
- After company approval and test acceptance, provision/verify the separate live
  plans and privately obtain the live scoped key through the merchant dashboard.
  Production uses production mode, matching live products/key and the canonical
  Dashboard return/webhook. WEB_BILLING_RELEASE_APPROVED remains off until the
  outstanding paid-launch checks and exact normal release are accepted.
- International and USD capability stay independent. Do not ask the owner to
  repaste earlier prices or credentials. Paystack verified five-day failed-renewal courtesy,
  dispute/partial-refund review and uncertain-outcome operations remain open
  implementation/acceptance gates; native store receipts do not close them.

## Verified observations and boundaries

The six saved test plans were fetched independently on 10 November and match the
approved prices/merchant/domain. The local profile has that key/catalog, all web
checkout/receiver/live/USD/international gates off and no owner-country binding.
Read-only API project inventories list 74 entries each for Preview and Production,
with none of the Paystack subscription/WEB_BILLING names. Project inventory is not
proof of effective deployed/shared values; no secret value was exported or changed.

The public website's three Choose buttons point to Plan and billing, where the
existing signed-in reviewer plan renders. This is handoff/render evidence, not a
Paystack charge. The selected Preview QA owner also renders billing; the attempted
upgrade was refused and displayed generic refresh wording. New source preserves
safe billing/QA rule messages through the existing error formatter.

Full evidence, validation limits and Brain impact:
[10 November receipt](../verification/2026-11-10-paystack-website-readiness.md).

## Official references

- [Nigerian company requirements](https://support.paystack.com/en/articles/2123970)
- [Activation and settlement account requirements](https://support.paystack.com/en/articles/2125506)
- [International NGN versus USD settlement](https://support.paystack.com/en/articles/2130690)
- [Paystack subscriptions](https://paystack.com/docs/payments/subscriptions/)
- [Test payments](https://paystack.com/docs/payments/test-payments/)

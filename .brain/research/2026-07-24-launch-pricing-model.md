# EwaTrade Launch Pricing Model

## Research question

What subscription pricing should EwaTrade launch with in US dollars, and what
localized lower-cost pricing should it offer Nigerian businesses?

Research date: 2026-07-24.

## Recommendation

Launch a flat, tenant-level subscription with three plans. Keep the same
entitlements in every country, but maintain separate USD and NGN price books.
Do not convert USD prices into naira at checkout and do not add an EwaTrade
percentage fee to merchant sales.

### USD price book

| Plan | Monthly | Annual | Annual effective monthly |
| --- | ---: | ---: | ---: |
| Starter | $9 | $90 | $7.50 |
| Growth | $29 | $290 | $24.17 |
| Pro | $79 | $790 | $65.83 |

Annual billing gives two months free. Show Growth as “Most popular.”

### Nigeria price book

For Nigeria, present a monthly equivalent but collect quarterly or annually at
launch. This lowers collection-cost leakage and failed-renewal exposure while
remaining materially cheaper than the closest local benchmark.

| Plan | Monthly equivalent | Quarterly | Annual | Annual effective monthly |
| --- | ---: | ---: | ---: | ---: |
| Starter | ₦3,000 | ₦9,000 | ₦30,000 | ₦2,500 |
| Growth | ₦8,000 | ₦24,000 | ₦80,000 | ₦6,667 |
| Pro | ₦20,000 | ₦60,000 | ₦200,000 | ₦16,667 |

Prices should be shown as exclusive of any legally applicable VAT, with the
tax and total made explicit before payment. Grandfather a merchant's NGN list
price for at least 12 months.

### Launch entitlements

Use EwaTrade's existing, already-enforced limits for launch:

| Entitlement | Starter | Growth | Pro |
| --- | ---: | ---: | ---: |
| Businesses/stores | 1 | 3 | 10 |
| Products | 25 | 150 | 500 |
| Staff | 2 | 10 | 50 |
| Offline devices | 1 | 5 | 20 |
| Report history | 30 days | 180 days | 730 days |
| Support | Standard | Priority | Dedicated/onboarding |

These limits are currently defined in
`packages/db/src/queries/retail-ops-subscriptions.ts` and documented in
`.brain/features/retail-ops-subscription-packaging.md`.

Do not create Nigeria-only feature definitions. The lower local price is the
regional affordability adjustment; Starter is already the limited model.
Country-specific feature matrices create support confusion and encourage
region arbitrage.

## Packaging rules

1. Give every new tenant a 30-day Growth trial without requiring a card. A
   complete stock-to-sale-to-closeout cycle often needs more than the 14 days
   used by some POS trials.
2. Keep core sale recording, exact inventory, customer book, closeout, credit
   sales, and offline replay available on every paid plan. Differentiate on
   scale, history, storefront publishing, and service level—not on whether the
   core operational loop works.
3. Charge no EwaTrade transaction commission on cash, transfer, card, or
   credit sales. When online collection ships, pass through the disclosed
   processor fee separately.
4. Put one EwaTrade-branded share/catalog surface in Starter, one published
   storefront in Growth, and expanded storefront/custom-domain support in Pro
   when those entitlements are production-ready.
5. Keep variable-cost messaging and custom domains outside the base plan.
   Sell messaging credit packs at provider cost plus a transparent margin;
   pass domain registration/renewal through separately.
6. At launch, require a plan upgrade when a tenant reaches a limit rather than
   introducing many small staff/store/device add-ons. Add-ons can be tested
   later once real limit-hit data exists.
7. Preserve read/export access after cancellation. Block new writes only after
   a clear grace period; never hold a merchant's historical business data
   hostage.

## Why these prices

### Global benchmarks

- Shopify's official US pricing is $39/$105/$399 monthly for
  Basic/Grow/Advanced, or $29/$79/$299 monthly on annual billing. Basic includes
  the online store and inventory, while higher tiers add staff and capability.
  EwaTrade at $9/$29/$79 enters well below this umbrella while it is still a
  launch-stage product. [Shopify pricing](https://www.shopify.com/pricing)
- Square's current US POS price book is $0/$49/$149 per location for
  Free/Plus/Premium. This supports a free or inexpensive acquisition surface
  and higher charges when team/location capability expands.
  [Square POS pricing](https://squareup.com/us/en/point-of-sale/software/pricing)
- Loyverse makes core POS, essential inventory, and 31-day analytics free,
  then charges $5/store/month for longer history, $25/store/month for employee
  management, and $25/store/month for advanced inventory. A merchant needing
  staff plus advanced inventory therefore reaches $50/store/month.
  [Loyverse pricing](https://loyverse.com/en-us/pricing)

The proposed $29 Growth price is consequently credible for EwaTrade's combined
staff, inventory, offline operations, reconciliation, reporting, and up-to-three
business allowance, while Starter stays accessible enough to acquire small
operators.

### Nigeria benchmark

Bumpa is the closest public Nigerian commerce-operations benchmark:

- Starter: ₦15,000 quarterly, ₦28,000 biannually, ₦55,000 annually.
- Pro: ₦30,000 quarterly, ₦55,000 biannually, ₦105,000 annually; includes three
  staff accounts.
- Growth: ₦150,000 biannually or ₦250,000 annually; includes five staff,
  two locations, POS, and assisted migration.

Bumpa includes unlimited product listings in all three paid plans and bills
quarterly, biannually, or annually rather than monthly.
[Bumpa subscription plans](https://support.getbumpa.com/support/solutions/articles/150000193102-bumpa-subscription-plans)

EwaTrade's proposed Nigeria annual prices are approximately 45% below Bumpa
Starter, 24% below Bumpa Pro, and 20% below Bumpa Growth. That is an aggressive
but defensible launch discount for a newer product, while the scale limits keep
support and infrastructure exposure bounded.

### Why NGN must not be a live FX conversion

The Central Bank of Nigeria reported an NFEM rate of ₦1,380.18/US$ on
2026-07-17. A direct conversion would put the $9 Starter plan near ₦12,422 per
month—far above the local benchmark. The proposed ₦3,000 monthly equivalent is
therefore a deliberate purchasing-power and competitive localization, not an
FX quote. [CBN key rates](https://www.cbn.gov.ng/IntOps/KeyRates.html)

The World Bank reports Nigeria's 2025 GDP per capita at $1,224.3 and consumer
inflation at 23.0%. This supports a lower NGN price book, annual price locks,
and periodic rather than continuous repricing.
[World Bank Nigeria data](https://data.worldbank.org/country/nigeria)

Review NGN prices quarterly for new subscriptions using local competitor
prices, payment costs, inflation, support cost, and conversion—not spot FX
alone. Limit any ordinary increase for existing merchants to renewal and give
at least 60 days' notice.

## Payment and tax considerations

- Paystack's official Nigeria pricing is 1.5% + ₦100 for local transactions,
  with the ₦100 waived below ₦2,500 and the total local fee capped at ₦2,000.
  A ₦3,000 monthly Starter charge would lose about ₦145 (4.8%) before any tax
  on fees; a ₦9,000 quarterly charge loses about ₦235 (2.6%). This is the main
  reason to collect the Nigeria entry plan quarterly.
  [Paystack pricing](https://paystack.com/pricing)
- Flutterwave lists Nigerian local collections at 2% and international
  collections at 4.8%, with transaction fees subject to 7.5% VAT.
  [Flutterwave Nigeria pricing](https://flutterwave.com/ng/pricing)
- Bumpa's official support documentation shows 7.5% VAT applied to its
  subscriptions and paid add-ons. EwaTrade should have Nigeria tax treatment
  reviewed before launch and make the pre-tax price, tax, and total explicit.
  [Bumpa VAT guidance](https://support.getbumpa.com/support/solutions/articles/150000221608-vat-7-5-on-bumpa-services-nigerian-merchants)
- For US subscriptions, Stripe's standard domestic-card rate is 2.9% + $0.30
  with no setup or monthly fee. Processor economics are comfortable at the
  proposed USD prices, but annual billing still improves cash flow and reduces
  churn. [Stripe pricing](https://stripe.com/pricing)

Use Paystack first for Nigerian web billing if its recurring-charge,
verification, settlement, and webhook behavior passes implementation
validation. Keep the provider-neutral billing boundary already present in
EwaTrade so another processor can be added without changing the plan model.

## Launch measurement and repricing gates

Run this price book for the first 100 paying tenants or 90 days, whichever is
later. Track:

- trial activation: first product, first sale, first closeout;
- trial-to-paid conversion by country and selected plan;
- monthly and annual/quarterly mix;
- limit-hit frequency by products, staff, stores, devices, and report history;
- gross revenue retention and failed renewal rate;
- support minutes and infrastructure cost per tenant;
- cancellation reason and willingness-to-pay interviews.

Do not raise prices merely because activation is strong. Reprice when Growth
conversion is healthy, support cost is understood, and at least one durable
value signal—such as weekly sales recording or closeout completion—predicts
retention. Existing founding customers should retain their original list price
for 12 months.

## Risks and unresolved decisions

- The 25-product Starter cap is materially stricter than Bumpa's unlimited
  listing and Loyverse's free essential inventory. Keep it for the first launch
  because it is already enforced, but inspect limit-hit and abandonment data
  weekly. If qualified merchants hit it before completing a full operational
  cycle, raise Starter to 50 rather than discounting further.
- “Dedicated support” is expensive and should mean scheduled onboarding plus a
  defined response target at launch, not an unlimited account manager.
- App Store/Play Store billing can impose different commercial and policy
  requirements. Prefer web checkout for business subscriptions unless store
  review rules require in-app purchase.
- Final Nigeria VAT registration, invoice wording, and whether displayed prices
  must be VAT-inclusive require tax counsel/accounting confirmation before
  collecting payment.

## Source quality note

Competitor and processor amounts above come from official first-party pricing
or support pages retrieved on 2026-07-24. The CBN and World Bank figures are
official/primary institutional data. Pricing is time-sensitive and should be
rechecked immediately before public launch.

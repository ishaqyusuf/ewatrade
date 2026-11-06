# Mobile free launch and later paid activation

Owner direction, 6 November 2026. EwaTrade is pre-market with no existing
customers. Ship a free mobile release first; merchant verification and payout
setup are deferred. This supersedes the 26 October paid-Android-first scope.
Existing development/QA records are not real paid customers and must not be
deleted or mass-rewritten. Preserve the existing free launch grants.

## Confirmed commercial policy

- The business owner pays for software access; invited staff do not purchase
  individual subscriptions. Permissions and the business's staff allowance still
  apply independently. Owner-wide Starter/Growth/Pro covers 1/3/10 businesses.
- Monthly payment in advance; no use-now-pay-later credit arrangement. No annual
  offer or introductory trial is approved. The free launch is not an auto-billing
  trial and must not silently start charging.
- Nigeria keeps the approved monthly baseline: Starter NGN 5,000; Growth NGN
  15,000; Pro NGN 30,000. Other African territories use the comparable base-price
  level. The owner selected a 20% uplift outside Africa in this chat.
- A customer may cancel renewal and return to Free. Cancellation preserves the
  verified paid period; it is not a refund of a charge already collected. Refunds
  follow the store's applicable process and mandatory rules. No unconditional
  cash-refund promise was approved.
- Requested failed-renewal courtesy window: five days, then Free. Excess features
  and quota usage become unavailable until renewed, with data retained. Do not
  delete products/history or treat a temporary provider outage as nonpayment.
  Cancellation, refund/revocation and failed-renewal grace are different states.
- Selling/transferring a business is not a launch feature. Billing must still
  verify the payer and current ownership: a new owner cannot inherit another
  person's store receipt. Do not add a business-transfer workflow to this launch.

## Regional pricing walkthrough (later paid release)

| Plan | Nigeria / Africa base, NGN reference | Outside Africa, NGN reference (+20%) |
| --- | ---: | ---: |
| Starter | 5,000 | 6,000 |
| Growth | 15,000 | 18,000 |
| Pro | 30,000 | 36,000 |

The reference column is a pricing rule, not a USD/EUR/GBP price or current FX
quote. Final local amounts must come from each store's actual country/region
price table, tax handling and available price points. A currency used in both
Africa and elsewhere must not receive one blanket currency-based price.

1. Create the three monthly subscription products/base plans as drafts after
   merchant setup. Keep Nigeria's existing template; leave trials/annual off.
2. Generate comparable prices for enabled African storefronts from the base.
   Review each consumer-facing total, including tax and store rounding.
3. Set each non-African storefront from the 1.20 reference. Do not infer eligibility
   from GPS, device locale, a merchant's edited business country or IP; the
   purchasing store account determines the store offer.
4. Export the complete territory/currency/customer-price table from Google and
   Apple for review. Do not claim exact foreign prices until that table exists.
5. Display and charge the store-returned localized offer. Align dashboard offers
   separately; configuring store prices does not configure a web payment provider.

[Google per-country pricing](https://support.google.com/googleplay/android-developer/answer/140504?hl=en)
supports individual overrides and currency/tax conversion.
[Apple subscription pricing](https://developer.apple.com/help/app-store-connect/manage-subscriptions/manage-pricing-for-auto-renewable-subscriptions/)
supports country/region price points and comparable prices. Checked 6 November.

## Five-day grace and downgrade implementation boundary

The requested five-day duration is recorded, not deployed. Apple's built-in
monthly grace choices are 3, 16 or 28 days, and service must continue through an
already granted store grace period. A five-day cross-platform promise therefore
needs a reviewed application courtesy entitlement and compatible store settings,
or an explicitly agreed platform-specific policy. Never truncate Apple's verified
grace to five days. Confirm Google's actual base-plan options when configuring it.
[Apple grace settings](https://developer.apple.com/help/app-store-connect/manage-subscriptions/enable-billing-grace-period-for-auto-renewable-subscriptions/).

Existing source blocks new over-cap admissions and retains data; it does not yet
implement the owner's requested restriction of existing surplus items. Before
paid activation, define a stable selection/recovery rule for sellable items and
staff, keep historical orders/financial records readable under normal permissions,
and verify both server enforcement and renewal restoration. Keep this out of the
free-launch critical path; do not silently archive or delete data.

## Free launch implementation

`apps/mobile/mobile-release-scope.json` is committed with
`softwarePlanPurchases: false`. The native provider stays inactive and Plan &
billing shows current server-derived plan/usage and informational tiers, without
purchase, restore, store-management or external upgrade actions. The future native
controller is owner-only. The IAP dependency remains staged, so the signed binary
and privacy inventory must describe actual included SDKs rather than claim absence.

The existing billing submission preflight now consumes this same scope. Free
scope requires Production profile and disabled `STORE_BILLING_ENABLED`,
`STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED` and `OWNER_BILLING_ENABLED` flags.
It does not require payment credentials. Paid scope retains the original complete
platform-specific preflight. Invalid/missing scope fails. This is local config
proof only; hosted flags and exact bundled source require independent verification.
Teen/safety, legal, API, iOS identity/login and platform submission gates remain.

Assistant impact: software-plan purchase remains form-only and deferred. No new
assistant capability, provider operation, server grant, role, API or schema change.
Merchant sales/payment recording is unaffected.

## Remaining launch work

- [x] Confirm free launch and separate later paid activation.
- [x] Record regional pricing direction and owner/staff subscription model.
- [x] Verify and commit the free-launch source and local preflight change.
- [ ] Accept the exact signed Android/iOS candidate and required safety/privacy flows.
- [ ] Complete truthful Play Data safety and Apple privacy/reviewer/build materials.
- [ ] Submit and complete the platform review/rollout process.

Six milestones for this continuation only; not a percentage of the entire
historical launch. Store acceptance cannot be inferred from source checks.

Future paid-only work: merchant/payout/tax setup; product prices/territories;
owner-billing hosted migration/client coverage integration; signed purchases,
restore/events/refunds; grace and surplus-item restrictions; minimal billing
record retention and operational support handling. Use existing support@ewatrade.com;
no new inbox/operator or invented numeric retention period is created here.

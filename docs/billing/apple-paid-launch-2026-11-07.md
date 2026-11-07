# Apple paid-at-launch preparation — 7 November 2026

The owner requires paid business-owner software subscriptions at launch. Staff
do not subscribe individually. The app download price is a separate setting.
Monthly Nigeria reference: Starter NGN5,000, Growth NGN15,000, Pro NGN30,000;
comparable Africa baseline, 20% higher reference elsewhere. Display actual Apple
storefront offers after configuring and reviewing currency/tax/price-point totals.

## Live commercial inspection

Correct organization and app verified in authenticated App Store Connect.
Paid Apps Agreement, the existing payout bank and both submitted US tax forms
are Active. Digital Services Act status is Active. No financial details were
changed, and no bank identifiers or tax documents are copied here.

Apple initially blocked membership resources/submissions on an updated Developer
Program License Agreement. The Account Holder reviewed and accepted it directly.
Fresh Apple account readback records the October29 agreement accepted November7,
2026, with the update warning removed. The agent did not accept a binding agreement.

The owner subsequently authorized creation of three monthly products and regional
prices. Subscription group **EwaTrade Owner Plans** now exists (22556222).
**EwaTrade Pro Monthly** exists (6832031107), product ID
`com.ewatrade.owner.pro.monthly`, period1month, Prepare for Submission.
Growth and Starter are not created yet. Availability, localization, server mapping
and review metadata remain unfinished. Previous iOS6 remains historical Preview evidence.

Pro pricing is still in the unsaved country-price wizard. Apple offers the exact
NGN30,000 baseline and NGN36,000 higher reference. The175territory tables were
captured from the UI;41African storefronts are to retain the lower comparable
prices while134others use the higher reference.22of41African overrides have been
applied in the retained browser wizard, through Malawi;19remain. This is not a
saved price schedule. Local resume data is retained outside Git at
`/private/tmp/ewatrade-apple-pricing-resume.json`, and Chrome tab6431705 is retained.
No trial, public publication, checkout activation or charge occurred.

The owner then prioritized dashboard password recovery before Apple completion.
New user-owned chat `01a1b704-65c8-7412-b430-8a98b63e24c4` is implementing that flow
in the current checkout; Apple setup is preserved for resumption afterward.

## Code and configuration audit

- Native controller already supports Apple account binding, transaction-ID server
  verification, finish only after verification, restore and foreground recovery.
  Existing owner/session/cache-generation fences remain authoritative.
- Plan & billing previously routed only Android into the native panel, even if
  paid scope were enabled. It now supports both iOS and Android. The release-scope
  flag remains false and server checkout flags remain closed; this is preparation.
- Four actual-controller Apple fixture cases cover fresh owner token/localized
  renewal terms, missing terms/cross-provider refusal, transaction-ID restore and
  verification failure without finishing. These are simulated native modules,
  not signed StoreKit sandbox or production acceptance.
- iOS preflight incorrectly required Google Play refund-review configuration.
  It now requires Apple/common settings without requiring another store's refund
  service; Android and all-store preflights retain those requirements. Apple refund
  events and operational response still require lifecycle acceptance.
- Local Production-profile paid preflight reports closed billing flags, absent
  product mapping and absent Apple IAP key/issuer/private-key configuration. No
  credential values were printed. Hosted settings were not inspected and cannot
  be inferred from local absence. No credential contents were printed; later
  approved local key custody is recorded below. Hosted configuration is unchanged.
- Live Users and Access inspection subsequently confirms In-App Purchase has
  **Active (0)** keys. Existing App Store Connect upload keys are a separate
  category and were left untouched. The owner then explicitly approved creation
  and secure storage of **EwaTrade Subscription Server**. Apple now shows Active(1)
  and a7November download date. The one-time .p8 download was recovered after the
  browser event listener timed out, validated as P-256 and moved from Downloads
  into Git-ignored local credential custody (directory0700/file0600). Contents
  were never printed or committed. No hosted secret or billing flag was changed.

## Paid Apple checklist

This is a new Apple-specific paid-release denominator, not the historical free
3/6 or Android A01–A08 count. **1/6 accepted**; source progress is within open rows.

| ID | State | Required completion |
| --- | --- | --- |
| I01 Commercial prerequisites | Accepted | Live agreement/bank/tax status and owner-accepted updated program license verified. |
| I02 Products and prices | Open | One subscription group, three ranked monthly products, reviewed localized prices/territories, no unapproved trials; returned IDs mapped on server. |
| I03 Native/server configuration | In progress | Routing correction and fixture checks pass; secure API-key custody, exact environment, notification delivery, owner coverage/cutover and native linkage require target proof. |
| I04 Policy and privacy | Open | Effective paid terms/privacy, SDK/provider/deletion facts, operational refund response and five-day policy compatibility. |
| I05 Signed money acceptance | Open | Current signed candidate: purchase, restore, renewal, failure/grace, cancellation, refund/revocation, account/business switching; existing records usable while new admissions obey limits. |
| I06 Review and rollout | Open | Actual candidate screenshots, reviewer login/contact, privacy/age declarations, selected build plus first subscriptions submitted together and approved rollout. |

Apple native monthly grace permits3/16/28days, not5. The owner confirmed five days
total with additional application/server implementation. That implementation and
its lifecycle acceptance remain pending; no native grace setting has changed.
Never shorten an already verified store grace period or infer nonpayment from
provider failure. Reviewer workspace/contact and sandbox email remain unconfirmed.
Manual address entry for launch and support@ewatrade.com as the primary inbox
have been recommended; the owner has not yet selected those privacy/support options.

Assistant impact: billing remains form-only through existing domain commands. No
assistant capability, API contract, role, schema or server entitlement change.

## Verification

Offline doctor passes. Mobile TypeScript passes. Final owned-path fast smoke,
including preflight and impact paths, passes259tests /1,679assertions plus QA
types/Biome (initial mobile-only selection177/922). H01 snapshot and H02 pass.
Focused provider/disclosure7tests /
23assertions passes, with18 child controller cases (four new Apple cases). Billing
preflight12tests pass and subscription source guard passes. Initial filter-style
test invocation did not run the child fixtures correctly; explicit `./` paths
execute and pass. These are source checks, not signed/store acceptance.

Apple key creation/download occurred under explicit owner approval. No device
or whole-release acceptance, live charge, billing activation, product publication,
database operation, push or deployment is claimed.

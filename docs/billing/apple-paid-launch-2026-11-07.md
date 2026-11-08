# Apple paid-at-launch preparation — 7 November 2026

Current checkpoint, 8 November: Apple acceptance remains **2/6**. Commercial
agreements/payout/tax and three regional subscription products are accepted. The
reviewer login and Free workspace are prepared. The retained accepted Production
API is `dpl_7A7vegqRxaiUVanBUsw9RPNcLmHg`, source `dafec2e01`; earlier combined
rollout and Preview TEST receipts below remain historical evidence.

Paid native scope and the guarded Production TestFlight build target are committed
in `45e9a8c55`, but no current signed iOS artifact is built or uploaded. The
reviewer-only seven-key configuration is saved for the next API deployment;
effective runtime checks remain pending and public checkout stays closed. The existing internal TestFlight group contains
only the Account Holder, with manual build distribution and no external groups.
Final clean source, effective backend configuration, signed money/lifecycle and
privacy/legal acceptance remain open. See the
[current candidate receipt](../verification/2026-11-08-production-testflight-paid-candidate.md)
and [prepared iPhone checks](../verification/2026-11-08-iphone-paid-testflight-checklist.md).

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

The owner authorized and completed creation of three monthly products and regional
prices in **EwaTrade Owner Plans**, group22556222. All remain Prepare for Submission.

| Level | Product | Apple ID | Product ID | Nigeria monthly |
| --- | --- | --- | --- | --- |
| 1 | EwaTrade Pro Monthly | 6832031107 | `com.ewatrade.owner.pro.monthly` | NGN30,000 |
| 2 | EwaTrade Growth Monthly | 6832035627 | `com.ewatrade.owner.growth.monthly` | NGN15,000 |
| 3 | EwaTrade Starter Monthly | 6832036267 | `com.ewatrade.owner.starter.monthly` | NGN5,000 |

All175current storefronts are selected for each product; automatic availability in
future storefronts is off. English (U.S.) group and product names/descriptions are
saved. Family Sharing is off; multiseat purchases are disabled, leaving App Store
purchasing, consistent with owner-wide plans rather than staff seats. No trial,
annual offer, review submission, checkout activation or charge was performed.
Subscription review screenshots/notes and the signed app candidate remain pending.

Each full175country price table was validated against its intended region before
confirmation.41African storefronts retain Apple's comparable baseline;134others use
Apple's equalization from a20%higher NGN reference (6k/18k/36k). This does not guarantee
an exact20%increase in every local price: Growth US is9.99USD from both15k and18k
references, while Starter US is3.99USD versus baseline2.99 and Pro US22.99 versus19.99.
The actual saved prices are in [the525row export](apple-regional-prices-2026-11-07.csv).
The [exact server mapping](apple-subscription-products.json) parses through the
existing catalog schema and is now installed in API Preview/Production settings.
Those settings were included in the common `bf9bc356` deployment. Live billing
verification remains I03, rather than an assumed consequence of deployment.

The owner resumed Apple work after prioritizing dashboard password recovery.
That separate chat completed source df9dbb798; reuse its evidence. Shared launch,
manual native address entry, support aliases and public-after-approval decisions
are now canonical in [the shared launch index](mobile-paid-launch.md). Use the
[one shared paid/privacy draft](../releases/mobile-permissions-disclosure-draft-2026-11-07.md);
no duplicate Apple policy or unreviewed effective legal publication is introduced.

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
3/6 or Android A01–A08 count. **2/6 currently accepted** after fresh 8 November
readback confirmed the owner-accepted Paid Applications Agreement Active again.
Source progress is within open rows.

| ID | State | Required completion |
| --- | --- | --- |
| I01 Commercial prerequisites | Accepted | Owner accepted the updated Paid Applications Schedule; fresh 8 November Business reload shows Paid Apps Agreement, bank, both tax forms and DSA Active, with no new-agreement notice. |
| I02 Products and prices | Accepted | Group22556222; three ranked monthly products,175current storefront prices each, no trials; exact IDs installed in API target settings. Deployment/verification remains I03. |
| I03 Native/server configuration | In progress | Verifier/key/product settings and controlled review source deployed; genuine signed Preview TEST delivery passes. Verified reviewer identity and dedicated versioned Free workspace prepared on 8 November. Owner activation, Production gateway routing and registered signed iOS linkage/coverage still require acceptance. |
| I04 Policy and privacy | Open | Effective paid terms/privacy, SDK/provider/deletion facts, operational refund response and five-day policy compatibility. |
| I05 Signed money acceptance | Open | Current signed candidate: purchase, restore, renewal, failure/grace, cancellation, refund/revocation, account/business switching; existing records usable while new admissions obey limits. |
| I06 Review and rollout | Open | Actual candidate screenshots, reviewer login/contact, privacy/age declarations, selected build plus first subscriptions submitted together and approved rollout. |

Apple native monthly grace permits3/16/28days, not5. The owner confirmed five days
total with additional application/server implementation. Source now grants courtesy
only after verified billing-retry/grace status plus signed retry=true,
expirationIntent=BILLING_ERROR and auto-renew=on. The cutoff is exactly five24-hour
days after the last paid expiry, never after observation or notification arrival.
Replays cannot extend it; renewed paid expiry replaces it. Cancellation, refund/
revocation, unknown status, missing facts and verifier/network failure cannot mint
courtesy. Longer verified native grace is preserved. Invalid dates/bindings refuse.
This modifies only Apple verification projection; shared store/DB policy and Play
verification remain unchanged. At expiry, existing owner Free admission/retained
record policy applies. Signed lifecycle acceptance remains pending; no native grace
setting or live billing flag has changed.

Actual production Apple checkout readiness now checks common activation and Apple
verifier/product facts independently of Play refund operations. Android and combined
catalogs still require Play refund custody/monitoring. This completes the earlier
CLI preflight correction at the runtime boundary, without opening activation flags.
Reviewer workspace remains pending. Existing Apple membership provides the Account
Holder name/business phone for the review contact; no new phone input is needed,
but review-contact fields are not yet saved. The owner-created Nigeria sandbox
tester is verified. Manual native
addresses and support@ewatrade.com with founders@ewatrade.com operational routing
are settled in the shared index; backup/delivery acceptance remains open.

Assistant impact: billing remains form-only through existing canonical commands.
No new assistant capability, API input, role, schema or client entitlement authority.
Apple server expiry projection changes as described above; Play policy is unchanged.

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

## Product/courtesy phase validation

The525configured prices validate against41Africa/134other intended tables perplan;
three unique product mappings pass the existing server catalog schema. Browser
readback confirms ranked products and saved metadata/purchase options. CSV line
endings were normalized after the initial export. New billing tests pass23/136;
owned-path fast smoke259/1679 plus QA tooling types/Biome pass. These do not prove
StoreKit transactions or hosted configuration. Full API types pass with an8GBheap; H01 and H02 pass. The initial4GBtypecheck
ran out of memory, and the first full run caught an optional fixture-value
assertion corrected before the passing run. No release readiness is inferred.

## Native paid-candidate preparation

iOS still excluded expo-iap from autolinking after the free-first reversal. That
iOS-only exclusion is removed; Expo autolinking now resolves ExpoIapModule3.4.13
where the baseline did not. The config plugin remains present. Purchase scope and
server activation flags are unchanged. CocoaPods succeeds from apps/mobile/ios,
resolving ExpoIap3.4.13 and openiap1.3.15 (126dependencies/142pods). The initial
root --project-directory invocation resolved the wrong command context; the project
directory is the required working directory. Normal cache access was needed.

All three obsolete iOS location usage descriptions are explicitly disabled using
the installed expo-location plugin's supported false options. Production Expo
introspection verifies the registered bundle, IAP plugin, absent iOS location usage
keys and preserved Android location blocks. Native location callers remain absent;
separate web geocoding is unchanged. No redundant native UI pass is introduced.

Owned-path fast smoke259/1679 and QA types/Biome pass. An unsigned generic simulator
build succeeds in the existing ignored Preview native project (wTradePreview).
This cannot establish Production identity, StoreKit transaction or signed submission
acceptance. Build log: /private/tmp/ewatrade-apple-native-build.log; local derived
data: .scratch/apple-paid-native-build. Binary inspection of its debug dylib finds
92ExpoIap and3,936OpenIAP exported symbols; the generated module provider includes
ExpoIapModule. The main executable is a debug stub, so checking it alone is not
valid linkage evidence. Its bundle is com.ewatrade.preview, an unsigned local
Preview artifact. The generated Preview project is existing
local build state; Production permission truth is the separate fresh introspection,
not an assumed property of that Preview binary. Native changes require a new signed
binary; OTA cannot add this module to the historical installed build.

## Hosted Apple configuration — 7 November 2026

The existing linked Vercel API project ewatrade-api was read first: Apple IAP
verifier fields, product mapping and verifier environment were absent in Preview
and Production. The approved existing key was transmitted directly from its private
local file to the API project's sensitive settings through stdin, never arguments,
logs or Git. No replacement key or broader Apple access was created. Both targets
now have these eight settings, with successful add receipts and name-only readback:

- APPLE_BUNDLE_ID and APPLE_APP_ID match the registered release app.
- APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID and APPLE_IAP_PRIVATE_KEY use the approved key.
- STORE_SUBSCRIPTION_PRODUCTS contains the exact three Apple mappings above.
- STORE_BILLING_ENVIRONMENT is sandbox for Preview, production for Production.
- STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED is explicitly false for both.

Existing STORE_BILLING_ENABLED was not changed, nor were its values retrieved.
At configuration time no deployment occurred; the subsequent common `bf9bc356`
release deployed the API. Android must merge actual future Play entries into the shared mapping,
not replace it with a Play-only array. Hosted write success/name readback is not a
successful transaction, notification canary or private-key verification at runtime.

Fresh Apple Sandbox UI initially had no testers. The owner completed the prepared
New Tester form and submitted credentials directly. Readback now confirms Test
Accounts(1), Nigeria. The password was never entered/read/stored by the agent; the
account email remains in App Store Connect rather than copied into Git. Reviewer
workspace/credentials and signed StoreKit exercise remain pending.

## App Store notification destinations

App Information initially had neither server URL configured. Both were saved and
read back in App Store Connect for app6815837585:

| Apple destination | Saved HTTPS URL | Acceptance |
| --- | --- | --- |
| Production | https://api.ewatrade.com/webhooks/store/apple | Configuration/code deployed with existing closed gates; Production delivery and lifecycle acceptance pending. |
| Sandbox | https://preview-api.ewatrade.com/webhooks/store/apple | Genuine signed TEST delivery SUCCESS at exact6a4948c8 Preview candidate; purchase/lifecycle acceptance pending. |

These origins match the existing selected Production/Preview profile URLs. No
shared secret was generated, no transaction was submitted and no billing-enable
flag was changed. The running deployment must receive the new configuration and
current code through the existing release coordinator before delivery is accepted.
Fresh App Information also retains incomplete age/content-rights and China ICP
fields; subscription availability in175storefronts is not acceptance of every
country's app-distribution requirements. Do not invent a filing or declaration.

## Controlled App Review Sandbox — source prepared after common deployment

Apple [reviews In-App Purchases in Sandbox](https://developer.apple.com/help/app-review/before-submitting-for-review/configure-in-app-purchases/),
including a release build pointed at Production. Production-only verification
and the ordinary environment mismatch guard therefore need a narrowly scoped
review path. No client-selected environment or email-based entitlement is added.

- `APP_STORE_REVIEW_SANDBOX_ENABLED` defaults false. It requires the Production
  profile, both store/owner billing enabled and `APP_STORE_REVIEW_OWNER_IDS` as a
  JSON array of one to five distinct immutable User IDs. The dedicated reviewer
  workspace must first be created by the owner, then resolved by its approved
  inbox to an exact current User ID. No reviewer ID is configured yet.
  Both established Production profile spellings (`DEV_PROFILE=prod` and the
  canonical loader's `production`) are accepted only with `APP_ENV=production`;
  Preview, Local and mismatched profiles remain closed. Hosted Production profile
  values are sensitive/unreadable and were not inferred from blank placeholders.
- Only the authenticated allowlisted owner can see review-only Apple checkout
  while public checkout is false. Existing legal acceptance and OWNER-role gates
  still apply. Google and the legacy combined catalog retain their prior gates.
- Apple Production transaction lookup retries Sandbox only for HTTP404 with
  `TRANSACTION_ID_NOT_FOUND` (4040010), as [Apple documents](https://developer.apple.com/documentation/appstoreserverapi).
  Authorization/outage/other errors never trigger fallback. Sandbox transaction,
  renewal and notification signatures are verified using the Sandbox verifier;
  bundle validation and account binding remain mandatory.
- Verified facts remain `environment=sandbox` in durable purchase/subscription
  rows. Purchase application and enrollment resolve the approved owner's Apple
  environment under existing account/member locks; central coverage readers use
  the same policy. Ordinary owners, Google, wrong actors and legacy business
  receipts cannot receive this exception. Disabling it removes projected Sandbox
  access without deleting purchase history, business records or coverage.
- Apple has only one Sandbox notification destination per app. After coordinated
  deployment/configuration and signed checks, set that destination to the same
  Production webhook as Production notifications. The gateway fully verifies
  both Sandbox signatures before using the signed account token to route an
  approved reviewer locally. Other genuine Sandbox envelopes relay one way to
  the fixed Preview webhook only with `APP_STORE_SANDBOX_FORWARD_ENABLED=true`.
  Redirects, arbitrary destinations and credentials are excluded; delivery is
  bounded to5seconds/1KB acknowledgement. The peer must return HTTP200 with
  `received:true` before Apple is acknowledged. Preview never relays back.

The saved Sandbox URL is **still Preview**; no live review flags, URL or deployment
changed in this source phase. The genuine earlier Apple TEST canary was signature-
verified but Apple reported an unsuccessful HTTP response; replay returned503
because the receiver is gated off. This is a negative delivery result, not I03
or I05 acceptance. A TEST acknowledgement alone will not prove paid lifecycle flow.

Before signed review testing, ensure the dedicated workspace has versioned Free
owner-billing metadata and no legacy signup launch grant masking the purchase.
Signup before billing cutover can follow the legacy grant path; inspect only the
approved account and prepare it through a reviewed bounded account-specific step.
Do not rewrite ordinary customers or manufacture a paid receipt/grant. The owner
must finish email verification, agreement review and any new credentials directly.
The approved reviewer inbox is retained in private setup context, not this packet.

Source evidence: focused billing57tests/345assertions, guarded Development
Prisma integration1test/20assertions with all owned fixtures removed, and full
API/DB TypeScript pass. The integration injects trusted policy configuration;
the connected database profile remains canonical Local/Development throughout.
It verifies ordinary/Google/wrong-owner refusal, unchanged Sandbox persistence,
retry uniqueness, covered-plan projection, disabled-policy Free fallback and
membership-loss refusal. No Apple charge or signed StoreKit test occurred.
Final source smoke, assistant gates and commit are recorded in the handoff receipt.
Apple acceptance remains **2/6**.

## Deployed source and positive Preview receiver —7 November2026

The sole release coordinator deployed `6a4948c809ea3a83d3aed9ae4ca2d3f6a96f40d3`
after clean candidate checks. Preview API `dpl_BY9LBysYJSevcEgbrA4VniDv9ZyT` was
Ready, bound to https://preview-api.ewatrade.com and healthy before the TEST.
Only Preview `STORE_BILLING_ENABLED` changed false→true. Preview APP_ENV/DEV_PROFILE
are preview; owner/reviewer/relay flags remain absent. Existing Sandbox verifier
settings and checkout=false are retained. Sensitive readback placeholders do not
reveal configuration values. Production settings/URLs/native scope were unchanged.

At **22:40:33 WAT on7November2026**, one TEST request used the approved existing
IAP key. Apple's notification-status API reported **SUCCESS**, attemptDate
1794087633549. Its signed TEST was independently verified with pinned Apple roots
and the SDK for `com.ewatrade.app`/Sandbox. The private token and signed envelope
are not copied to Git. Sanitized evidence is
`/private/tmp/ewatrade-apple-sandbox-canary-6a4948c8.evidence.json`.
This supersedes the earlier503 delivery result for the old closed receiver.

Production API `dpl_8hHnYj6S3rTwYCYgv659bbShqA9G`, Dashboard and Marketing are Ready;
Production jobs20261107.2/tgh7ehhh exited0 and API health passed. Database is unchanged
and remains synchronized atbf9bc356. The registered signed native candidate is not
published. Exact release metadata and web/Android evidence are in the
[coordinator receipt](../plans/2026-11-07-full-production-release.md#corrected-appleandroid-handoff-released--7-november-2026).
Final web smoke23694671-fd16-4587-bd63-f803ace90dcd passes; Android's final sign-out
confirmation-selector failure remains a separate incomplete acceptance gate.

The TEST proves receiver signature verification, delivery and acknowledgement
only. It does not prove purchase, restore, renewal, grace, revocation/refund,
coverage, reviewer Sandbox activation or Production-to-Preview relay. Do not switch
the saved Sandbox URL or enable owner/reviewer/public purchase gates from this
result. Reviewer signup is still a direct human step; phone instructions were
provided without requesting credentials/codes in chat. Apple remains **2/6**.

## Verified reviewer workspace; commercial recheck — 8 November 2026

Owner completed email-code verification after the deployed signup-email repair.
EwaTrade Review is now one General store/Main store in Nigeria/NGN. Exact reviewer
identity is privately resolved; only that new workspace was prepared as versioned
Free through a backed-up, guarded transaction, with canonical effective-plan
readback. No paid receipt/grant was fabricated and no ordinary workspace or
global billing/reviewer flag changed.

A dedicated reviewer password reset-link is Delivered. App Review username/contact/
notes are prepared but unsaved; the owner must set the password and enter/save it
directly in Apple. Fresh Business state is Paid Apps Agreement Active (New Agreement
Available), with explicit new Schedule2 acceptance required for submissions. The
owner has a direct review request. I01 is reopened; current count1/6 supersedes the
prior2/6 until acceptance is verified. Bank/DSA remain Active, I02 unchanged.

Exact bounded-update, effective-plan, mail and pending-action evidence:
[reviewer workspace receipt](../verification/2026-11-08-apple-reviewer-workspace.md).
Signed registered iOS, Sandbox money/lifecycle, routing/configuration, policy/privacy
and submission remain open. Historical TEST evidence remains receiver-only.

### Commercial acceptance restored — 8 November 2026

Owner accepted the updated Paid Applications Schedule. Fresh Business reload
confirms Paid Apps Agreement, bank, both tax forms and DSA Active; no new-agreement
notice remains. Current checklist returns to2/6 (I01/I02). Reviewer password setup
is confirmed by exact-account credential metadata without reading a hash/password.
Owner completed the final Apple review-password entry; fresh reload confirms
username/password presence and saved contact/notes without reading credentials. Signed iOS, controlled
review activation, lifecycle tests and truthful legal/privacy acceptance remain.
See the same reviewer-workspace receipt for observed proof and requested inputs.

## Private Production TestFlight source prepared — 8 November 2026

Existing signing assets are restored/verified without certificate replacement
(91570cfc7). Existingios-testflight route now supports explicitProductioniOS
build/upload using isolatedtestflight-production profile/channel, Production
services, paidnativeScope, local signing, immutable reviewer scope and closed
publiccheckout/ordinarySandboxforwarding preflight. ProductionTestFlightOTA is
refused. Publicstore/ordinaryProductiongates remain; no build/flag/URL mutation
is claimed bysource. Rootownsremaining execution afterdeploymentchatarchive.

Source112/620 +ownedfast284/1813 +scoped/fullmobiletypes +Biome +H01/H02 pass;
currentreview/checkout/relay/policyunits16/165 pass withoutDB/providercalls.
Apple2/6 unchanged. [Exact target and execution limits](../verification/2026-11-08-production-testflight-paid-candidate.md).

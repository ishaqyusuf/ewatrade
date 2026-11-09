# Play regional catalog and acceptance inputs — 9 November 2026

Later 9 November update: the owner approved excluding eight territories after
reviewing existing AI-provider geographic terms. App and all three draft base
plans now reload with the same **165** named territories. All **522** stored
prices are unchanged; **495** are available and **27** retained/unavailable.
The earlier 173-country alignment below is historical. See the
[exact saved adjustment](2026-11-09-play-provider-territory-adjustment.md).

## Accepted configuration evidence

All three existing products now have saved base plan `monthly`, status **Draft**,
monthly auto-renewing billing, five-day grace and automatic 55-day account hold.
Each complete price table was saved, fully reloaded and expanded for inspection.
The [earlier minimal retry](2026-11-09-play-price-save-retry.md) first established
that error `540F8949` no longer reproduced. No root cause or Google case closure
is inferred; case `6-1181000042003` was last read as Open.

| Plan | Nigeria price | Africa reference | Outside-Africa reference |
| --- | --- | --- | --- |
| Starter | NGN 5,000.00 | NGN 5,000 | NGN 6,000 |
| Growth | NGN 15,000.00 | NGN 15,000 | NGN 18,000 |
| Pro | NGN 30,000.00 | NGN 30,000 | NGN 36,000 |

The Google calculator applied local conversion, tax and price-point adjustments.
All 44 individually supported African price destinations received the Africa
reference, including destinations inside the USD/EUR groups. Nigeria was then
set directly to its exact approved amount because bulk conversion produced a
higher amount. The 20% difference is a reference policy, not an assertion that
every rounded local checkout price differs by exactly 20%.

The [actual stored price table](../billing/play-regional-prices-2026-11-09.csv)
contains **522 named prices**, 174 per plan, with no blank prices. Example actual
store values for Starter/Growth/Pro are US USD 4.49/12.99/26.99, South Africa
ZAR 69.99/209.99/424.99, and Ghana GHS 50/160/310. Licensed purchases do not prove
production tax outcomes; exact store-returned offers still control checkout.
The [Play product mappings](../billing/play-subscription-products.json) contain
three actual product-to-plan identities. Base plan `monthly` and country prices
are separate configuration facts; the strict server mapping schema does not
accept arbitrary base-plan or offer fields. Existing Apple mapping entries were
preserved in the private six-entry parser check, not replaced.

## Exact country alignment

The authenticated Production country screen initially had 177 named targets.
Comparison against the 174 priced markets found four app targets without a named
paid price: **China, Cuba, Iran and Sudan**. Those four were removed from the
unsubmitted country draft under the approved supported-international-launch
policy. The app now has **173 named targets**, verified after full reload.

Central African Republic has a named Play subscription price but is not an
individually selectable app distribution country in this account's country list.
Its availability was therefore unchecked in all three base plans, each saved and
reloaded. Automatic **New countries / regions** remains off. App **Rest of World**
remains untargeted; it was not used to expand into unspecified countries.

Independent set comparison proves that each base plan's **173 available named
markets exactly equals the app's 173-country target set**. Removing availability
does not erase a stored price: Central African Republic's three amounts remain
in the price table but are unavailable. Thus the CSV contains **519 available
prices plus three retained, unavailable prices**, not 173 stored rows per plan.
Its `available_for_launch` column records this distinction.

Countries were saved to Publishing overview only. No Send for review, production
release, subscription activation, customer charge or rollout occurred. App and
plan configuration alone does not accept every jurisdiction's legal requirements.
The [country-specific Google guidance](https://support.google.com/googleplay/android-developer/answer/6223646?hl=en)
was checked on 9 November. Merchant/public-contact, age-signal and other applicable
country requirements remain tracked with the merchant, safety and review gates;
Brazil's age-signal applicability needs explicit reconciliation before launch.
No country was excluded merely to avoid an unfinished acceptance check.

## Reproducible evidence and limits

Private post-reload UI receipts, not committed:

- `ewatrade-{starter,growth,pro}-regional-saved-2026-11-09.txt` and adjacent PNGs.
- `ewatrade-{starter,growth,pro}-available-countries-2026-11-09.json` and
  `ewatrade-{starter,growth,pro}-availability-aligned-2026-11-09.png`.
- `ewatrade-play-app-country-targets-aligned-2026-11-09.json` and country PNG.
- `ewatrade-play-availability-acceptance-2026-11-09.json` and raw UI hash receipt.

The CSV is derived only from the actual UI country/price text nodes, checked for
174 unique names per plan and exact Nigeria amounts. The availability comparison
uses the separate reloaded country checkboxes, not whether an old price exists.
Raw screenshots can contain signed-in account context and stay private.

## Merchant and action-specific human inputs

The linked organization payments profile is retained. Its dashboard offers
**Add a payment method to receive your earnings**; the owner's bank deferral is
unchanged. US and Taiwan tax sections show **No tax info on file**. These screens
alone do not establish a licensed-testing or charging restriction.

The existing document review confirms that the private CAC certificate contains
the organization's TIN. It does not establish tax residence, classification,
treaty eligibility or a signer's current authority. The original identifier was
not recopied into chat, source or this receipt. Exact questionnaire facts and any
required certification must come from the authorized person.

Three prepared Google actions await the owner's specific answers:

- Trader public-profile consent and local-law self-certification: unchecked,
  unsubmitted. Google's [trader guide](https://support.google.com/googleplay/android-developer/answer/17594752)
  gives existing accounts a 1 February 2027 deadline; an immediate global block
  is not inferred from the banner.
- License testing: the existing internal QA list contains one account matching
  the signed-in owner. The final account-wide Save confirmation is pending;
  no list membership was changed and no test purchase occurred.
- Google Play Developer API enablement and its displayed terms in the existing
  `ewatrade-mobile-retail-ops` project: Enable was not clicked. The service-account
  table has no rows. No service account, key, IAM role or Play access was created.

The only connected approved Android emulator is Google APIs based with
`PlayStore.enabled=false`; its `com.android.vending` package is LicenseChecker,
not accepted Play Store billing evidence. Only the development EwaTrade package
is installed. The owner was asked to connect the previously approved Samsung;
no substitute emulator, package installation or purchase was performed.

## Target and runtime prerequisites

Read-only Preview API project metadata and complete filtered linked-shared
metadata queries did not list Play Publisher credentials/file, package, notification
audience or service-email settings. Secret values were not inspected or decrypted.
This is configuration metadata, not a credential-validity or task-local proof.
A configured verifier/notification path is required before licensed acceptance.

The ordinary Preview native identity is `com.ewatrade.preview`; the registered
Play app is `com.ewatrade.app`. A Production-targeted artifact cannot simply use
licensed Sandbox receipts: the existing Google verifier refuses that environment
mismatch, and the Production reviewer exception is expressly Apple-only. Those
checks were preserved. A narrow, isolated same-package/signer plus Preview API
profile proposal is prepared for review; no profile, build or Production exception
was implemented. [Google's test guide](https://developer.android.com/google/play/billing/test)
permits matching-package license-test sideloads for preliminary verification;
that does not replace exact signed Play-delivered release acceptance.

The shared coordinator has separately accepted actual read-only hosted jobs
plan-reader proof on exact `e1626301dd3aef0925ac9cda3b2140c9cfc04012`, version
20261109.2, after matching Preview smoke and Production rollout. Preview refused
with empty input; the approved Production reviewer returned Starter from
owner_subscription with fresh ACTIVE OWNER scope. That does not prove Google
purchase handling, ordinary/Free cases or an authenticated Dashboard render.
The [shared jobs receipt](2026-11-09-billing-reader-job-check.md) retains that scope.

## Ticket and release state

The owner approved progression through all 18 local acceptance tickets as an
ongoing goal. They are published locally. Ticket 01's concrete save/reload gate
is resolved. Ticket 06's pricing, availability comparison and canonical catalog
are recorded here; country compliance and final offer activation/target/signed
acceptance remain open. This does not promote Android A01–A08 beyond **1/8**.

The repository release owner explicitly closed the temporary source hold before
these five owned documentation files were written. No shared launch-index,
application, runtime/secret configuration, artifact, deployment or parent-issue
change is included. Three Google approval handoffs remain pending. Brain task and
native-store-billing records are updated locally.

## Documentation validation

Validation is scoped to the five owned catalog/receipt documents. It includes the
offline doctor and five-path fast plan with zero unmapped paths. Focused checks
pass 51 tests / 254 assertions plus QA-tooling types and changed JSON formatting.
The strict canonical parser accepts three unchanged Apple plus three Play entries;
522 CSV rows and all three 173-country set comparisons pass. All 19 internal file
links and owned whitespace checks pass.
Existing source/native/provider checks remain attached to their original evidence;
none is repeated merely for this documentation checkpoint.

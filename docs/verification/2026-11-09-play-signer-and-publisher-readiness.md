# Android signer and Publisher readiness

9 November 2026. Executes the owner's existing-signer export approval and
Vercel login retry. This is operational preparation, not signed-build or paid
subscription acceptance. Android remains **1/8 (12.5%)**.

## Completed checks

- A fresh normal Vercel CLI login exited successfully. An independent account
  check returned the expected `ishaqyusuf` identity. The previous disabled
  authorization page was not forced. Root/Apple was informed the shared CLI
  session is usable again.
- Retrieved the one existing default EAS Android JKS identified in the
  [approved custody review](../plans/2026-11-09-play-upload-key-custody.md), without
  creating, rotating or changing remote credentials. Local `keytool` confirmed
  a private-key entry and the exact registered build 36 upload certificate.
- The JKS is in the approved ignored private directory (0700), file 0600.
  Added only its Android signing entry to ignored `apps/mobile/credentials.json`
  (0600). Before-write concurrent-change checks passed; all original iOS and
  other non-Android fields are preserved. The canonical
  `playPreviewSigningFailures` returns an empty list. No password/key material
  was printed or put in documentation, messages or Git.
- Reused the actual server `getPlayPublisherClient` with the approved local
  Publisher credential. Google's documented, empty-body
  [subscription catalog GET](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/list)
  returned HTTP 200 for `com.ewatrade.app`, all three expected product IDs and no
  next page. This proves authentication and catalog-read access; it does not
  prove purchase lookup, order operations or hosted credential deployment.
- All three monthly base plans returned `DRAFT`, `P1M` billing and `P5D` grace.
  Nigeria prices remain NGN 5,000 / 15,000 / 30,000. Each returned 174 regional
  price configurations; that is **not an enabled-territory count**. The prior
  [165-territory UI receipt](2026-11-09-play-provider-territory-adjustment.md)
  remains the availability evidence. The API omitted the custom account-hold
  field; Google's [resource contract](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions#AutoRenewingBasePlanType)
  defines omission as recommended hold of 60 days minus grace. Thus 55 days is
  a documented inference, consistent with the earlier UI, not a returned value.

## Preserved gates and next candidate

Read-only Preview environment metadata confirms both Publisher credential and
`STORE_SUBSCRIPTION_PRODUCTS` are sensitive, Preview-only, with no branch
qualifier. The normal CLI pull endpoint also returned a redacted catalog value.
No raw hosted values were printed or persisted. Current hosted catalog equality
and additional entries remain unknown. Do not overwrite it from the empty local
Apple baseline or treat the dated canonical Apple source as a current read.

The proposed six-entry Apple/Play union remains `BLOCKED_REVIEW_ONLY`. Its local
signing blocker is cleared; hosted catalog preservation and controlled runtime
activation remain open. Current peer API/jobs/assistant and native configuration
changes prevent a clean, exact release candidate. Preserve those changes and
revalidate the final committed native configuration rather than borrowing the
earlier unchanged-source observation. No prepare-only build was attempted against
those dirty inputs.

Play RTDN was last independently observed off in the
[transport receipt](2026-11-09-play-preview-notification-provisioning.md); no
notification was sent here. No plan activation, purchase/customer record read,
refund/cancel action, app build/upload, deployment, legal publication or guardian
grant occurred. Source checks and setup remain separate from final signed,
hosted, lifecycle, privacy and release acceptance.

Private redacted evidence (0600):

- `/private/tmp/ewatrade-upload-signer-export-2026-11-09.evidence.json`
- `/private/tmp/ewatrade-current-preview-env-metadata-2026-11-09.json`
- `/private/tmp/ewatrade-current-preview-catalog-read-2026-11-09.evidence.json`
- `/private/tmp/ewatrade-publisher-catalog-read-2026-11-09.evidence.json`

Offline doctor passes. The explicit three-owned-file quick plan has no unknown
mappings; focused smoke passes **51 tests / 254 assertions** plus QA-tooling
types/Biome. Six relative document links, ignored private paths, actual file/
directory modes, export-proof assertions and whitespace pass. Other agents'
current source changes are excluded from this documentation check. Fresh
credential custody, exact signing and provider GET evidence is recorded above.
No application code changed in this checkpoint. Check log:
`/private/tmp/ewatrade-signer-readiness-quick-2026-11-09.log`.

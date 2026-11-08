# Owner subscriptions Workshop correction — 8 November 2026

[Review the Workshop](https://workshop.localhost/ewatrade/legacy/mobile-ui-audit/android-2026-08-24/business-subscription). At this preview checkpoint: design previews only; no product/native/backend source, billing configuration, provider action, purchase, fixture or deployment had been performed. The later selected native implementation is recorded separately below.

The owner correction supersedes the unselected v3 proposals: keep the current Green Till top plan card and vertical Usage section in their current positions. Only Owner subscriptions downward varies. All three directions share identical upper markup/styles and source-derived limits. The current source has **30 days** of Free report history; the earlier handoff’s 7-day value was stale.

## Exact published revisions

| Key | Direction | Revision | Version |
| --- | --- | --- | --- |
| a | Owner ledger (recommended) | `e33d8ec7-faa5-453c-a84b-f72d9ca5fb00` | 9 |
| b | Focused plan picker | `b0508f24-6368-44f5-b631-b435632f7cc3` | 9 |
| c | Side-by-side tiers | `6845948e-46c1-4216-ac8b-f1feddb719d1` | 9 |

At v9 publication the catalog had `selectedRevisionId: null`, status exploring, implementation count 0. Stable project/workshop/direction identities are unchanged. Every earlier revision is preserved, including historical d/v1 `d7bbaf75-01bf-4937-95c5-d863ba99d458`. Historical August approval is documented baseline evidence, not selection of a new revision. Intermediate corrected v4–v8 remain immutable history; v9 is the review candidate.

## Scenario coverage

**15/15 requested scenario groups mapped; 53 finite named states in each direction.** This is simulator coverage, not a measured percentage of native/payment acceptance. Each archived direction bundles `coverage.json` with the complete state list, scenario-to-state/interaction mapping, source limit values and authorship. The floating config State list exposes every named state. Verification outcome supplies explicit local server/finish/refresh/stale results; dialogs supply purchase, enrollment, release, restore and handoff outcomes.

| Group | Scenario | Named states |
| --- | --- | --- |
| 1 | Free business; all three monthly offers, renewal terms, Restore/Manage/legal | `free` |
| 2 | Catalog loading, partial price, missing period, unavailable/unmapped/gated checkout | `loading`, `partial`, `period-missing`, `store-unavailable`, `unmapped`, `checkout-gated` |
| 3 | Offline saved/no snapshot; refresh errors with/without snapshot | `offline`, `offline-empty`, `error`, `error-empty` |
| 4 | Owner vs staff/admin | `free`, `staff`, `admin` |
| 5 | Confirmation, cancel/no grant, pending approval, purchase error | `free`, `cancelled-purchase`, `pending`, `purchase-error` |
| 6 | Server verification/recovery, verified owner, finish failure, reopen | `verifying`, `verification-error`, `owned`, `finish-error`, `reopen` |
| 7 | Paid owner, uncovered business, explicit enrollment, pending/failure/idempotent retry/success | `owned`, `enrolling`, `enrollment-error`, `covered` |
| 8 | Covered tier and slots; full allowance; over-business-limit; safe switch | `covered`, `slots-full`, `over-limit` |
| 9 | Release confirmation/cancel/processing/failure/success; data/renewal retained | `covered`, `releasing`, `release-error`, `released` |
| 10 | Restore processing/success/no mapped purchase/catalog unavailable/verification failure/idempotency | `restoring`, `restore-success`, `restore-none`, `restore-catalog`, `restore-error` |
| 11 | Manage store handoff/open failure, renewal cancelled with remaining paid access, provider conflict | `manage-open`, `manage-error`, `renewal-off`, `provider-conflict` |
| 12 | Verified retry/five-day courtesy/native grace; expiry/cancel/refund/revoke; retained over-quota fallback | `courtesy`, `native-grace`, `expired`, `cancelled`, `refunded`, `revoked`, `no-courtesy` |
| 13 | Session/account/business change mid-action; stale out-of-scope results | `session-change`, `business-change`, `stale-result` |
| 14 | Current legal review, failed secure opening or missing policy; restore availability | `legal-required`, `legal-missing`, `legal-error` |
| 15 | Region/currency and translated long monthly disclosure | `localized`, `region-ng`, `free` |

## Focused verification

- Offline QA doctor passed. Fast-source plan inspected; it initially contained another chat’s Apple source work, so those unrelated tests were not run as Workshop evidence. No EwaTrade runtime was started.
- Canonical permanent Workshop route returned HTTP 200; gallery displayed all three current directions plus historical d. Each archived option rendered.
- Browser selected all 53 states in each direction (159 state selections), with zero script errors. Upper markup was identical across a/b/c.
- Each direction passed local purchase cancellation/no grant → confirmation → awaiting server verification → verified owner/uncovered business → enrollment failure/retry → confirmed coverage. Release cancellation/failure and restore preserving verified coverage were exercised, followed by account change discarding the old snapshot.
- Focused shared checks passed missing-price/period gates, offline purchase/restore refusal, staff/admin authority, missing policy and failed policy opening with Restore still allowed, release success/Free fallback, Manage opening failure/no invented paid grant, and restore no-purchase/catalog-failure results.
- Shared panel passed visible state switch, theme, compact 320×568 size, collapse/reopen, navigation to option 02 with theme/size/panel preferences preserved, reset, and Escape dialog close. Reduced-motion mode was used. No duplicate viewport/theme matrix or device/payment probes.
- Final focused result: 40 recorded assertions passed, zero script errors. Screenshots and raw browser receipts are local in `/private/tmp/billing-final-{a,b,c}.png`, `/private/tmp/billing-browser-result.json`, `/private/tmp/billing-final-result.json`, and `/private/tmp/billing-panel-verification.png`. These are synthetic HTML evidence, not signed-device evidence.
- Preview sources contain no provider/API/model calls. The shared Workshop gallery loaded its existing esm.sh Pretext presentation dependency; no billing/auth/provider endpoint was requested by the simulations.

## Provenance and approval boundary

Actual author: Codex automatic takeover. The source chat’s exact Opus 5.5/high launch was rejected before execution because it requested broad external-model access to sensitive repository/private temporary locations. That launch was not retried; no Opus output is claimed. This chat continued the established takeover under the Workshop skill’s bounded execution policy. Private payment evidence was not copied into these artifacts.

All dialogs say Preview only. Purchase confirmation does not grant verified subscription or coverage. Server verification and explicit Cover this business remain separate. Release retains records and does not stop store renewal. Restore is idempotent in the local model. Retry/courtesy/native grace and retained over-quota fallback are design states, not accepted native lifecycle behavior.

Owner selection of an **exact revision** is required before native implementation. Selection does not authorize provider actions or deployment. The separate Apple deployment chat owns live recovery and current acceptance; this Workshop does not promote the handoff’s Apple 2/6 status.

Workshop deliverable checklist: grounding, corrected alternatives, scenario mapping and published verification **4/4 complete (100%)**. Native implementation is outside this task and remains unstarted.

## Brain impact

Updated local-only `.brain/qa/2026-11-08-owner-subscriptions-workshop.md` with these exact revisions, scenario coverage and approval boundary. No API, permission, schema or domain behavior change; no assistant capability was added. Static preview sources and publication history remain in the global Workshop ignored work/catalog directories as requested. Static preview sources are not committed to the product repository; this review receipt is retained here.

## Subsequent owner selection

The owner later requested “implement 01”. Exact a/v9 selection is now recorded.
Native source implementation and its separate validation/release boundary are
recorded in [the implementation receipt](2026-11-08-owner-ledger-implementation.md).
The previous unselected/design-only statements above describe the preview checkpoint.

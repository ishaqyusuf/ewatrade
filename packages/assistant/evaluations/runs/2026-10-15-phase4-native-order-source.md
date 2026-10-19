# Phase 4 native order source checkpoint

15 October 2026. Continues the authorized remaining-phase work. This is source
evidence for D01–D03/A04/H01–H03; it does not accept a parent milestone or enable
a planned capability. The shared checkout contains separate WhatsApp/privacy work.

## Implemented

- Native Edit now handles order replacement, individual/batch product fulfilment,
  service authorization/performance and product return. Save goes through the
  existing editProposal → refreshed review → explicit confirmation flow. It does
  not call domain writes directly. Existing original-order receipt navigation is
  reused. The parent keys editors by proposal ID/revision; access scope also
  remounts this editor.
- Replacement queries the exact original Order using current authorization.
  Mount-owned, fresh successful reads are required before original names/pricing
  are shown or Save is enabled; cached, pending, paused and denied reads cannot
  supply them. Original fixed/order-total policy determines the editable price
  field. Missing, duplicate or unsupported original sources refuse Save.
- Edits preserve the action, Order, selected lines, stock destinations and saved
  fulfilment selections. Money uses the strict stated-money converter; excess
  decimal places are refused rather than silently truncated. Shared strict schemas
  enforce quantity, reason, field and amount bounds before re-review.
- Returns expose the four existing dispositions. Only restocking retains the
  reviewed destination; the merchant can choose the original source. Other
  destinations require a new chat draft. Returns explicitly do not promise credit
  or refund; authorization explicitly does not claim service performance.
- Six capability rows now declare mobile source support. Roles, scope, versions,
  canonical procedures and rollout are unchanged: product return remains planned;
  the other five remain source. No activation, provider or runtime change.

## Executed verification

| Check | Outcome and limits |
| --- | --- |
| Values + parity + saved-model + discoverable isolated regression wrappers | 26 pass / 112 assertions. Includes 12 value cases and existing routing/cache tests. Four wrapper assertions represent child processes, not extra business cases. |
| Actual new editor, isolated static component fixture | 7 pass / 41 assertions. Native primitives and query hook are stand-ins; actual editor/freshness/validation code is used. This is not device, keyboard, layout or saved-network evidence. |
| Other isolated wrapper children | Existing C04 recovery 20/49, inventory routing 8/16 and transfer-result 7/8 passed in fresh processes. Total four children: 42 cases / 114 assertions; do not add the wrapper count as domain coverage. |
| Scoped formatting | New editor/value helper/tests, registry, fixture and wrapper pass Biome. The pre-existing general-proposal-editor custom-line index-key warning remains outside the added dispatch hunk. |
| Native scoped compiler graph | Exits 2 with 78 diagnostics in imported API/database/native baseline paths; zero diagnostics in the new editor/helper/tests/registry/dispatch files. Full native type-green is not claimed. Log retained at /private/tmp/assistant-phase4-native-types.log. |
| Registry audit | 150 capabilities; 74 writes; 21 declared mobile writes (was 15), 39 mobile reads. Full-manifest write editor/receipt gaps 53 (was 59); declared mobile write registry gaps 0. Registry membership is not acceptance. |

Reproduce source checks with:

```sh
bun --env-file=/dev/null test packages/assistant/evaluations/phase-regressions.test.ts apps/mobile/src/components/mobile/assistant/native-order-values.test.ts apps/mobile/src/components/mobile/assistant/native-parity.test.ts apps/mobile/src/components/mobile/assistant/general-model.test.ts
```

The component fixture runs in a subprocess through the discoverable wrapper so
its module stand-ins cannot affect other suites. Existing CI invokes that wrapper;
no hosted run was dispatched. The six exact manifest row transformations and
owned source hashes are captured in the adjacent source snapshot. Whole-file
manifest/coverage hashes include concurrent changes and are not ownership claims.

## Remaining acceptance

Phase 4 stays **0/3**; Phase 3 **4/5**; overall **13/45 (28.9%)** accepted,
**32/45 (71.1%)** open. No native/provider/release milestone was accepted.

Connected D01–D03 transitions must still prove persisted exact stock/financial
effects, illegal transition immutability, replay/concurrency/response loss and
saved client Edit/review/confirm/reload/original navigation. D03 is wider than the
product-return action. Actual device journeys, current role/Store changes,
offline/background behavior, keyboard and large text remain A04 acceptance work.
The current observed emulator was running, but its app surface was inaccessible
to computer use; this source checkpoint makes no new device observation.

No schema, database, persistent fixture/grant repair, runtime restart, capability
activation, provider, push or deploy action occurred. G01/Paystack pauses, D04
fingerprint stop, E05 rejected activation/restart, G04 deferred sections and S05
unscheduled retry remain. Source ownership was posted through repository handoffs
c3f37e26 and 05a56bd5; foreign manifest and proposal changes were preserved.

## Final gate and device triage

Coverage regeneration and subsequent freshness check pass; whole-checkout impact
gate passes (12 records; 7 capability/6 procedure rows changed). This validates
classification/documentation consistency, not independent acceptance of foreign
WhatsApp/schema work. Source whitespace check passes.

Host-authorized read-only ADB enumeration reaches emulator-5554 and the foreground
com.ewatrade.dev MainActivity. Its current screen is signed-out OTP verification.
Thus the former computer-use attachment limitation can be worked around through
the existing device bridge, but a normal authenticated QA session is still needed
for actual native journeys. No screen input, code request, app/emulator/API restart
or sign-in mutation was performed. The private triage screenshot stays in /private/tmp;
it is not published as acceptance evidence.

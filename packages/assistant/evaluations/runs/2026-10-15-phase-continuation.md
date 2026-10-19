# Assistant operation phase continuation

15 October 2026, Africa/Lagos. Owner requested continuing from Phase 3 through
the remaining phases while preserving existing gates. Base observed: `1c375d35`;
the shared checkout also contains independently changing WhatsApp work.

## Completed source repairs

1. **C04 saved transfer recovery.** A completed proposal previously returned its
   receipt after central active-Store authority only. A current scoped Manager
   could lose the other Store or its stock grant and still recover that result.
   The adapter now has an optional `authorizeRecovery` seam, invoked in the same
   fresh proposal transaction before completed recovery. Transfer adapters read
   only saved identities, bind the receipt to the original transfer/Tenant and
   dispatch endpoints, and require current inventory authority at both Stores and
   the correct confirmation Store. It never re-runs a stock review or movement.
   Valid completed recovery still returns the original receipt after later stock
   transitions and approval expiry. This changes decision recovery only; it does
   not certify every historical chat projection's record-specific access policy.
2. **Inventory form routing.** Both the form hook and global audit sheet consumed
   `inventoryOperation`. `transfer` opened the intended transfer form and an
   erroneous Stock operation sheet querying record ID `transfer`. All six form
   modes had this collision. The audit consumer now excludes the existing form
   modes while preserving exact original IDs and existing URLs. No UI redesign,
   query-key migration or canonical stock write was needed.
3. **E03 simple-transfer receipt boundary.** The adapter used the generic canonical
   JSON result without validating `entryId`, allowing malformed objects/scalars
   to become invalid success receipts. It now uses the same nonempty journal-ID
   schema as the ordinary movement adapter. Its refusal helper is an explicit
   never-returning function, allowing TypeScript to narrow a missing Book without
   casts or non-null assertions. Valid amounts, accounts, posting and UI are unchanged.
4. **C04 verifier precision.** The future connected verifier now requires the
   actual FORBIDDEN wrong-Store refusal and exact INSUFFICIENT_STOCK overreceipt
   refusal, rather than accepting any thrown error. The latter also checks that
   the saved transfer/acknowledgments remain equal to the partial-receipt snapshot.
   This verifier was not connected or counted as executed acceptance.

## Verification

All source executions used `--env-file=/dev/null` and an unreachable
`postgresql://fixture:fixture@127.0.0.1:1/assistant_source_tests` initializer when a
database URL was required. No real database/client connection is made by these
fixtures. Each module-mocked fixture runs alone; the ordinary discoverable test
wrapper spawns isolated children so mocks cannot leak into API/dashboard tests.

| Check | Result and scope |
| --- | --- |
| Current C04 contracts/access/quantity/review/locks/coordination/acknowledgment proof | 43 pass, 391 assertions; memory fixtures, no database |
| New actual proposal decision recovery fixture | Initially 4 pass/9 fail after correcting fixture setup; final expanded 20 pass/49 assertions. Real decision/central authority/transfer authorization; only membership/age loaders replaced. No persisted or concurrent HTTP proof. |
| New actual inventory hook + details component fixture | Before 2 pass/6 fail; after 8 pass/16 assertions. Both consume the same URL through actual parsers; audit body replaced to observe unintended opening. |
| New simple-transfer result fixture | Before 3 pass/4 fail; after 7 pass/8 assertions. Actual adapter; canonical movement review/posting stood in. |
| Discoverable isolated regression wrapper | 3 pass/3 wrapper assertions; children are the 35 logical cases/73 assertions above, not additional business coverage |
| Existing simple-transfer contracts/adapter/canonical money transaction | 7 pass/46 assertions |
| Existing H05 actual decision fixture | 8 pass/29 assertions; rollout refusal, saved receipt recovery, cancellation, fresh role/Store/session/privacy |
| G05 canonical manual-message and assistant adapter | Separate processes: 8 pass/44 and 5 pass/31; planned/manual-only behavior, no sends or queues |
| Affected API compiler | Final source check exits 0 after fixing seven simple-transfer diagnostics; no broad repository/mobile typecheck claimed |
| Coverage freshness | Check exited 1: generated snapshot stale while shared WhatsApp code is changing; no unclassified-procedure error reported by that invocation. Do not claim current whole-checkout coverage green. |
| Impact gate | Whole checkout exits 1 only for the independent changed search.records row missing an impact record. This continuation's actual four coverage rows and five product paths independently pass with zero errors/zero capability or procedure row changes. Shared schema/router/identity work is excluded from that scoped pass. |
| Formatting/whitespace | Ten owned/shared source, fixture and impact paths pass Biome at the recorded checkpoint; scoped git diff --check passes. The integration verifier retains unrelated historical formatting and was not broadly reformatted. |

Reproduce the new regressions with
`bun --env-file=/dev/null test packages/assistant/evaluations/phase-regressions.test.ts`.
The repeatable affected compiler configuration is
`packages/assistant/evaluations/phase-continuation.tsconfig.json`.
The existing assistant-gate workflow now invokes the isolated regression wrapper.
Its exact command passed locally; no hosted workflow was dispatched or certified.
Twelve source/test/config hashes are captured in
[the source snapshot](2026-10-15-phase-continuation-source.json); the mixed
general-proposals file is explicitly labelled as containing foreign channel hunks.

The first C04 fixture command lacked the required `./` explicit-file prefix and
matched no tests; the next run lacked its ephemeral signing key and failed at
scope setup. Neither is evidence for the product defect. The valid control run
then reproduced the nine recovery gaps above. An initial compiler config in
`/private/tmp` could not resolve Bun types; an explicit existing root typeRoots
fixed that setup error before source diagnostics were assessed.

## Browser and device evidence

Existing canonical local dashboard was available. Normal QA domain/profile login
restored the existing Mama Bisi Farms demo Owner session. Inventory loaded its
five balances. Stock operation → Transfer reproduced the two-sheet failure.
After repair, reload at the same URL showed only Transfer stock, with source,
stock, destination, quantity and reason controls. Close removed the form query.
No message, proposal confirmation, stock or bookkeeping movement was submitted.

Read-only root-profile inspection confirms the current explicit `.env.local`
target is non-Production but is **not** either database permitted by the existing
C04 isolated suite. No network contact, URL derivation, profile edit or target
substitution was performed. This is an immediate connected-run prerequisite,
separate from the outstanding bounded timing/transport evidence.

![Transfer form after routing repair](/Users/M1PRO/.codex/visualizations/2026/10/15/01a13ea5-3f2c-77d0-a39b-b7e89251bef3/c04-transfer-form-fixed.png)

Android Studio's installed `/Applications` app shows EwaTrade Assistant QA running
on API34. Selecting its existing Show command did not expose an emulator/app
surface to computer use. No reboot, stop, wipe, build or settings change occurred.
This is a present access limitation, not evidence that the emulator is stopped.

Current native registry audit: **150 capabilities;76 reads/74 writes;39 declared
mobile reads/15 mobile writes;0 registry gaps among declared mobile writes;59
write capabilities lack an editor and/or exact receipt kind across the full
manifest**. All three C04 actions lack both. This static audit does not cover
read-target navigation, mounted behavior, saved device journeys or rollout.

## Remaining phase work

| Phase | Current continuation and remaining requirement |
| --- | --- |
| 3 | Two source/browser blockers repaired and verifier refusals tightened. C04 still needs a bounded full connected lifecycle/transport/finance run on the verified isolated target, actual saved dispatch/partial-receipt/return screenshots and native parity. The old launcher permits only its named isolated databases; do not substitute the current shared QA database or derive another credential URL. |
| 4 | D01–D03 retain partial source/evidence. Full supported transition, financial/stock, saved client and recovery journeys remain; no blanket rerun or new acceptance inferred from the shared recovery seam. |
| 5 | E03 result/type boundary repaired; existing simple pilots retained. Broader E01–E05 acceptance remains, including the three saved purchase procedures behind their specific E05 activation/restart gate. |
| 6 | Staff implementations remain owned by their existing implementer. S05 needs refrozen dependencies and a bounded connected proposal; its stopped suite was not retried. |
| 7 | D04 authorization-fingerprint discrepancy and conditional cases remain; D05 connected verifier unscheduled. No skipped hash, fixture/grant repair, availability bypass or retry. |
| 8 | G01 connected QA remains human-paused. G02 saved/persisted/concurrent acceptance remains open; stock closeout does not certify financial close. |
| 9 | G04's prior reviewed packing/custody source is reused with historical proof. G05 manual-message source exists and current canonical/adapter checks pass; connected/concurrency/client/wider settings scope is open. Media scope remains separate. |
| 10 | Paystack pause preserved, including repair/extension/registration; no provider research refresh, account action, sandbox or live money. |
| 11 | Fresh registry audit and running-device display attempt recorded above. Source parity and device acceptance remain open. |
| 12 | Discoverable isolated regressions and reviewed impact record added. Coverage/impact outcomes are bounded by the changing shared checkout. Hosted CI, canary and release approval/execution remain open. |

## Coordination and status

Repository handoffs `a212b69f`, `c473137b` and `9d0faacc` declare exact ownership
and findings. The shared general-proposals file acquired another session's
channel-principal/linked-session hunks during work; those bytes were preserved.
Only this chat's completed-recovery branch belongs to this continuation. No
whole-file stage, reset, commit, push, restart, schema or provider action occurred.

G04/G05 are now marked partial in the board because implemented source exists.
This corrects two stale unstarted marks: **13 accepted,29 partial,3 unstarted
(45 total)**. Accepted local web milestones remain **13/45 (28.9%)**; pending
acceptance **32/45 (71.1%)**. No native, provider or rollout milestone was accepted.

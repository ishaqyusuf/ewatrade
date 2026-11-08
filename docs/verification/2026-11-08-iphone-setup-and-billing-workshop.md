# iPhone Setup input diagnosis and billing Workshop — 8 November 2026

## Setup input: observed state, no configuration change

On private build10 the owner reports Setup assistant opens but its input is
disabled. A read-only Production query, scoped to the already verified reviewer
User/business IDs, found one SETUP conversation with status SKIPPED and no RUNNING
request. No messages/prompts were read by that query; no model call or data write.
Mirroring screenshot independently shows that business, the disabled composer and
the green **Continue setup** action. Screenshots work; even unrelated native clicks
fail through the Mirroring control bridge, so no click success is claimed.

Actual `setup-assistant-screen.tsx` disables its composer until conversation status
is ACTIVE. Catalog entry only navigates; Continue setup calls the guarded existing
`open()`/`begin` flow to resume SKIPPED/COMPLETED/OFFERED sessions. State/owner/Store,
offline, pending/run and cache-generation safeguards also remain authoritative.
The text Setup state route has no payment configuration switch disabling this
reviewer; role/active Store guards remain. No billing or assistant configuration
was changed during this diagnosis. The owner subsequently confirmed **typing
works after Continue setup** on the installed iPhone build10. That completes the
reported resume/input check without a native patch or configuration change.

No native code fix is claimed. The confirmed cause was the inactive session and
its existing resume step. Successful typing does not establish a model response
or record creation. Local private screenshot `ewatrade-setup-skipped-build10.png`
is retained outside Git.

## Billing Workshop continuation

Latest owner correction and routing: preserve the **current top plan card and
Usage section exactly as implemented**, in their current order. Revise only
Owner subscriptions downward, with all relevant UI states. Earlier unselected
v3 proposals do not override this restriction. Dedicated Workshop chat
`01a1bcaf-470c-7bf2-bce4-4ff54a73485e` owns the next same-path immutable revisions;
deployment chat `01a1bcab-cc78-74e1-b58f-2fe679c1341d` independently owns recovery
of the existing Starter purchase. See the [handoff and scenario scope](2026-11-08-apple-billing-workshop-handoff.md).

User requested a screenshot and Opus5.5 Workshop. Current build10 billing screenshot
and current native plan/owner-coverage/offer source ground the comparison. MUI-B026
documents approved August Compact Plan Ledger A; its four historical variants were
preserved in the shared catalog before same-key revisions a/b/c. Historical d
retains v1 and is labeled historical, including its superseded trial/limit copy.
No historical approval is invented as a selection of today's new revision.

Automatic approval review rejected the proposed Opus launch because broad repo and
temporary-directory read access could expose credentials/private evidence to an
external model. The command did not run. Under the owner's standing takeover rule,
Codex authored the bounded static revisions directly. No substitute Claude model,
lower effort, permission bypass or claim of Opus authorship.

Permanent review: [Plan & billing Workshop](https://workshop.localhost/ewatrade/legacy/mobile-ui-audit/android-2026-08-24/business-subscription).

| Direction | Current exact revision | Version |
| --- | --- | --- |
| a · Compact Plan Ledger (recommended) | d0390739-04dd-42fa-bc95-57561fd91c9f | 3 |
| b · Owner plan first | 61bccbb3-7919-413b-bd68-10729d6e902b | 3 |
| c · Plan comparison | b1807858-e995-46c1-8390-0e68dda66768 | 3 |
| d · Historical August comparison | d7bbaf75-01bf-4937-95c5-d863ba99d458 | 1, preserved |

Preview keeps current business plan/usage, three monthly offers, explicit owner
coverage, restore/manage and policy links. Actual observed dollar prices are sample
storefront content, not a global price assertion. Source plan limits are retained;
no trial, annual or staff-seat purchase. A follows the approved compact ledger,
B leads with offers below a green summary and expandable usage, C aligns offers
as a compact comparison. All preserve separate purchase and business enrollment.

Static files live in Workshop's ignored `work/ewatrade/legacy/mobile-ui-audit/`
tree; immutable revisions are catalog artifacts, not product source commits.
No selected revision, native implementation record, provider request or deployment.
Future implementation needs the owner's exact design selection under Workshop.

## Bounded verification

- JavaScript syntax checks pass on all three directions before publication.
- Shared Workshop route renders all revised options and the historical direction.
- Actual archived A preview exercises simulated confirmation/cancel, Starter
  purchase leaving the business Free, explicit Cover this business producing
  Starter coverage, restore feedback and reset. All are local preview state only.
- State change, dark/light, compact/standard sizing and config collapse/reopen
  work. Rendered-option state navigation preserves theme/size settings. Single
  screen only; no unused extra screen or fake navigation flow is claimed.
- Current A full-page screenshot retained privately. No native purchase, restore,
  cancellation, model request or product fixture was executed by these checks.

These checks establish a reviewable Workshop, not native or Apple acceptance.
Apple remains2/6; paid tests and public submission gates stay open. Brain impact:
feature/current-task notes record the diagnosis and design-only status; no API,
permission, database schema or product behavior changed.

Documentation milestone checks: offline doctor passed; explicit owned six-document
fast-smoke scope selected core only with0 unsupported paths,51 tests/254 assertions
plus QA tooling types passed. Owned local Markdown links and git diff --check pass.
Prior signed/source proofs above are reused for unchanged implementation; no new
app typecheck, model request, native money test or deployment was manufactured.

Brain files updated locally (ignored by repository policy): `.brain/BRAIN.md`,
`.brain/tasks/in-progress.md`, `.brain/features/native-store-billing.md`,
`.brain/features/mobile-production-release.md`, `.brain/features/ai-setup-assistant.md`
and `.brain/decisions/2026-11-07-apple-review-sandbox.md`. They distinguish deployed
receiver/signed product visibility from open acceptance and preserve earlier history.

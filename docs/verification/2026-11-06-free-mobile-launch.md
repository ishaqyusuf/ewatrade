# Free mobile launch preparation — 6 November 2026

Source base `6b549b56c`; implementation committed as `6097c1c1` in the current main checkout. Existing staged explainers and
AGENT_CHAT history are not part of this change. No worktree/branch switch.

## Changes and policy

See [owner decisions and remaining six milestones](../billing/mobile-free-launch-2026-11-06.md).
Shared committed release scope disables native purchase initialization and keeps
Plan & billing informational. No purchase/restore/external-upgrade controls in
the free candidate. Full paid preflight remains unchanged behind paid scope;
free scope requires three billing flags closed. No source grant, schema or API
change. Staged native IAP remains included; SDK absence is not asserted.

Whole-mobile TypeScript exposed a pre-existing invitation attempt inference
error (`delivery` assigned after creation). Reuse a named InvitationAttempt type
for the ref and local variable; no runtime/response behavior changed.

The existing Maestro smoke now visits the plan screen after canceling its sale
draft, verifies the free-launch message and no purchase/restore controls, then
uses its existing normal sign-out/runtime check. No fixture or business write.

## Source checks

- Offline doctor passes dependencies/profile/client presence.
- Billing readiness tests: 11 pass, including malformed/free/paid scope and
  fail-closed flags; no credentials printed or provider calls.
- Actual free provider render in an isolated native-module fixture passes: owner
  and linked module still do not initialize store/API hooks; child remains visible.
- Existing subscription/staff/reconciliation/disclosure: 20 tests/48 assertions.
- Initial owned-path fast smoke: 177 tests/922 assertions. Final selection including
  the assistant impact record and smoke flow broadens to 259 tests/1,679 assertions;
  QA types/Biome pass. This is not whole-checkout/release acceptance.
- Full mobile TypeScript passes after the invitation annotation. Initial inherited
  failure retained here; no suppression/cast or unrelated staged changes used.
- Subscription source guard passes. H01 snapshot current; H02 one impact record,
  zero capability/procedure changes. Whitespace check passes.
- Local Production billing preflight passes closed/free scope without merchant
  credentials. This is not a hosted flag read or store approval.
- iOS login and organization identity local preflights pass with the exact runner
  Production markers. An initial direct Node invocation failed on TS config's
  CommonJS require; use Bun as the existing release runner does. A follow-up
  without APP_VARIANT correctly refused; complete runner markers pass.

## Runtime and live consoles

- Existing local API/Metro liveness pass using the installed Portless CA. Initial
  default-CA probe failed; no service restart or TLS bypass. No DB query from this
  liveness check. Native smoke runs on the explicit EwaTrade device.
- Initial Maestro initialization was blocked by sandbox access to its installed
  dependencies; the authorized retry initialized successfully. Its catalog scroll
  exhausted the old 20-second window before reaching the old Snail fixture. The
  private config now selects existing visible Eggs at NGN150, without seeding.
  A second run timed out while scrolling the larger existing QA business list;
  the failure screenshot shows the selected business heading at the bottom.
  Allow that existing profile scroll 60 seconds, then repeat the same smoke.
  Neither failed run reached the new plan assertions or produced passing evidence.
- Subsequent runs identified stale catalog/accessibility and variant selectors in
  the private config. The accepted catalog selector is the observed full Eggs
  button label; the draft uses the observed unambiguous Crate of eggs offering
  (NGN4,500). These are separate existing records, not new fixtures. The outer
  runner allows six minutes for the expanded flow; its eight tests/48 assertions
  pass. No assertion was weakened or skipped.
- At source `5458bea2`, the run completed populated catalog, draft total, Cancel,
  Current plan, no Plan unavailable, free-launch message, no Restore purchases,
  no Manage store subscriptions, ordinary sign-out and final development-runtime
  checks. Final cleanup failed because the chooser opened in its existing compact
  sheet mode, whose actual close label is `close modal`, rather than the full-screen
  `Close QA businesses`. The smoke now accepts either observed close control and
  requires return to signed-out login. The failed receipt remains failed; the flow
  must be rerun before calling the whole smoke passed.
- Final canonical local Android smoke **passes 1/1** on `a1924396`, including
  all free-plan assertions and the corrected cleanup, with no sale/payment
  submitted. Receipt `036aa54d-8ba0-42d3-b1cf-f501e48f91ca`, completed
  2026-11-06T16:28:32Z; private artifact directory
  `.scratch/qa-release/artifacts/52ecf4fd-1589-4e06-a69b-ae408879d4fe`.
  It explicitly records `target: local`, `clean: false` (preserved unrelated
  changes), `runtimeVerified: false` and no signed runtime IDs. This is local
  development acceptance only, not a qualifying Preview/Production receipt.
  Further edits after this run are documentation/coordination only.
- ADB inventory: EwaTrade GreenTill_API34 on emulator-5556; emulator-5560 belongs
  to Halalvest and is out of scope. Configured physical R5CX153J81W is disconnected.
  No iOS simulator booted; no physical signed acceptance claimed.
- Google Play live read: correct Zeroes and One organization, EwaTrade
  com.ewatrade.app, Draft/Internal testing, Production inactive, 10/11 setup.
  Data safety remains incomplete at step2: collection Yes and account methods/
  deletion URL exist, transit encryption and optional partial-deletion answer
  are unset. No answer saved/submitted. Signed actual provider/data-flow facts
  are required before final declarations; free pricing does not remove them.
- New Google trader-status declaration due 1 February 2027, observed in Console.
  Not mistaken for the incomplete merchant payments profile.
- Apple App Store Connect now explicitly reports the Apple Account locked for
  security reasons. The retained tab offers Unlock Account. The owner was asked
  to complete Apple's recovery directly; no credential/reset action was performed.
  Current metadata cannot be certified from the historical October view.
- Current native source includes Expo Contacts and its selected-contact New sale
  flow (`phone-contact-picker.ts`, `use-sale-contact-pick.ts`). Android asks for
  read permission on use; source blocks WRITE_CONTACTS. iOS uses the native picker.
  Selected name/number can populate a customer draft; the helper does not bulk
  enumerate contacts. The October privacy packet predates this SDK/permission.
  Reconcile the actual signed candidate's contact categories and privacy report
  before filing; existing name/phone manifest entries alone are not that review.

`bun run release status` refreshed read-only status after permitted Git metadata
access: Production database10, Dashboard236, marketing219, API218 and jobs206
commits behind their recorded tags; mobile has no release-tool tag. This means
the current checkout is not the deployed candidate. The missing mobile tag does
not erase historical Play internal distribution evidence. No push/rollout occurred.

## Boundary

No merchant verification, payout data, subscription price activation, provider
configuration, store declaration, signed build upload, deployment or public
release performed. Do not remove the teen/safety gate to bypass unresolved
signed-client/privacy/operational evidence. New checks are source/local evidence.

Brain impact (local-only): BRAIN, tasks/in-progress, native-store-billing,
owner-wide-billing and decisions/2026-11-06-free-mobile-launch. No schema/migration,
API contract or capability change; no such documentation rewrite needed.

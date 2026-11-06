# Free mobile launch preparation — 6 November 2026

Source base `6b549b56c`, current main checkout. Existing staged explainers and
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
  liveness check. Native smoke remains to execute on the explicit EwaTrade device.
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
- Apple App Store Connect requires normal sign-in; the owner was asked to sign in
  directly. Current metadata cannot be certified from the historical October view.

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

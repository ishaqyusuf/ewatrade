# Existing Starter Sandbox purchase verification — 8 November 2026

Status: source correction verified locally; hosted rollout and durable recovery pending.
Apple I01–I06 acceptance remains **2/6 (33.3%)**. This is the one existing licensed
Starter purchase on installed private 1.0.0(10), not a replacement purchase.

## Actual failure and private input

The owner completed Starter in TestFlight and Apple displayed success. Production
API dpl_CRXkzyZQrtHSew3SWAFeuhv1tRyT returned400 for verifyPurchase at19:26:43Z;
the related Apple callback returned503 at19:26:35Z. The owner saw awaiting
verification, then tapped Restore once without recovery. The exact reviewer
read at19:27:00.512Z still found zero purchases/subscription/coverage and Free.
Cancellation/no-grant from19:22:14Z remains accepted separately.

The source chat retrieved one failed SUBSCRIBED history row at19:39:16.951Z.
Installed Apple SDK full Sandbox envelope/bundle and nested transaction signature
verification passed, with exact existing owner account token equality. Its private
capture contains real signed data and identifiers and must never be committed.
No additional purchase, TEST notification, account grant or provider mutation was
performed by this diagnosis.

## Reproduction and cause

`bun --env-file=/dev/null /private/tmp/ewatrade-apple-verification-replay.ts`
loads the explicit Production profile and the already approved local IAP file key,
re-verifies the genuine signed notification and calls actual verifyAppleSubscription.
It makes no database call or write. Local profile files omit IAP key material, so
the harness supplies only the already approved file key/key identity; this does
not establish equality with hosted secrets.

Before correction: envelope PASS Sandbox; subscription FAIL HTTP401, apiError null.
With only the lookup environment selected as Sandbox: complete subscription
verification PASS Sandbox, same account binding, revoked=false. The normal
Production-first path fails before its404/4040010 fallback. The same key's Sandbox
transaction/status calls succeed. Apple SDK collaborator explains that an app
without a Production release can receive401 on Production endpoints:
[Apple SDK issue60](https://github.com/apple/app-store-server-library-node/issues/60).

## Correction and boundaries

The existing server-only reviewer decision now selects Sandbox **before** lookup.
It is derived from the authenticated actor or the owner account named by a fully
verified Sandbox notification, under exact immutable reviewer-ID/profile/billing
policy. No client field or decoded untrusted claim gains authority. This matches
the existing Sandbox-only coverage resolver for the dedicated review account.
Remove its exception before using that account for real Production purchases.

No authentication error is reclassified as transaction-not-found. Ordinary owners
use their configured environment and never dispatch failures to Sandbox. Sandbox
401/503/404 remain failures, with no retry or Production fallback. Full transaction
and renewal signature/certificate/bundle/environment checks, original transaction
selection, owner/actor binding, durable locks and explicit business enrollment
remain required. Verified facts remain Sandbox. Five-day courtesy is unchanged.
No schema, new RPC, assistant capability, native source, UI or public activation.

## Validation

- New real verifier-seam unreleased-Production401 regression failed before fix;
  passes after direct reviewer Sandbox selection.
- Original genuine capture replay passes the actual corrected verifier, using
  read-only Apple transaction/status endpoints; no durable reconciliation claimed.
- Focused Apple projection/lookup/notification and reviewer policy:23tests,
  169assertions pass, with an unusable local DB sentinel and no provider calls.
  Initial notification-suite invocation lacked that sentinel and failed at module
  initialization; corrected run passes without connecting to a database.
- Owned-path fast smoke:284tests/1813assertions, QA tooling types and Biome pass.
  Initial formatting failure was corrected before rerunning.
- Full API `tsc --noEmit` passes. H01 coverage snapshot is current.
- H02 passes: one reviewed domain impact record, zero capability/procedure changes.
- Source SHA256: apple-subscriptions.ts `3618da304203e561ea3773ba7f092256c3f8adaf702a0fd0618492d233b34485`; apple-review-verification.test.ts `82da61821476a0ec98d50f3f0b6b5937f90aae06108594df6e69a174b9f561a4`; bun.lock `05bbb4dda2da05b9a80add9e9608e2d2b47f4943c3a0872929c7efe9c58c3348`.
- Brain impact: local-only decision2026-11-08-apple-review-environment-selection.md records the changed dispatch policy. Existing feature/API/index updates wait for source-chat documentation handoff to avoid overlap.
- UI testing is not applicable to this server-only source change. Signed native
  purchase/restore, durable coverage and lifecycle acceptance remain separate.

## Remaining execution

Commit the reviewed source/impact/receipt, use the normal API-only Preview release,
match existing-data web smoke to the candidate, then normal Production release.
Keep the checkout clean so the release tool does not create its dirty-checkout
worktree (owner prohibits worktree creation). Preserve signed build10/no private
Production TestFlight OTA, publiccheckoutfalse and WEB settings.

After the corrected hosted verifier is proven, recover the existing signed purchase
through the normal verified notification/restore path and perform one exact scoped
read. Never make a fake receipt or direct paid grant. Accept purchase only after
true Sandbox owner/subscription state is durable; explicit coverage, restore
idempotence, lifecycle and API/Dashboard/jobs reader consistency stay open.

# Existing Starter Sandbox purchase verification — 8 November 2026

Status: web/API Production rollout and original Starter server recovery complete.
Basic installed-app enrollment and one Restore confirmed9November; first-tap cause, native store-finish, further switching/lifecycle and shared paid-reader acceptance remain open.
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

## Release attempts and current candidate

User explicitly approved normal API-only Preview→matching existing-data smoke→
Production and verified recovery after source commit454972d8c. Initial sandboxed
release could not write FETCH_HEAD and did not reach provider actions. Automatic
approval initially rejected inherited deployment authorization; the owner then
explicitly approved the named source rollout and recovery in this chat.

On retry, concurrent WhatsApp edits appeared in main. The normal executor began
its dirty-checkout worktree path; execution was stopped130 before deployment.
Its newly created checkout had no changes, verified with separate structured Git
status outputs. The first cleanup review confused main's WhatsApp changes with
that checkout; after explicit per-checkout evidence, ordinary no-force Git removal
succeeded. No worktree remains from this attempt; no user work was discarded.
Future release starts require a clean-main/candidate guard.

CLI identity and exact EwaTrade project API access now pass; no renewed login or
new access grant was needed. Current main560d6e25c also includes another chat's
owner-approved WhatsApp code-sent wording476f874d3 and documentation-only handoff.
Automatic approval rejected deploying this newer payload because the explicit
approval named454972d8c and the additional source change was not approved in this
chat. No Preview push, deployment or Production change is claimed.

The combined candidate will be approved explicitly after final documentation and
checks; do not bypass normal release gates or switch branches/worktrees to evade
the rejection. Existing signed build10 and approved billing source are unchanged.

Brain impact completed: BRAIN, tasks/in-progress, features/native-store-billing,
api/contracts, api/permissions and the prior review decision now link the new
local-only environment-selection decision. No database documentation change is
needed: schema and persistence rules are unchanged.

Combined-candidate validation: WhatsApp's existing focused suite passes9tests/65
assertions; H02 against ba354f2ef passes with both reviewed domain impact records
and no capability/procedure change. This establishes the added wording's local
regression check, not permission to deploy it. Full combined API typecheck also
passes. Exact candidate approval is next.

## Preview ready; source movement prevented acceptance

Owner explicitly approved combined candidate116ca57cb89949c58fbf195eafac35cd24952213
(billing454972d8c, WhatsApp wording476f874d3 and docs). Normal clean-main guarded
API-only Preview release reused its passed candidate receipt (284tests/1813assertions),
passed environment checks and pushed through the existing Preview executor.
API deployment `dpl_7sn1o5jJd8mQ4irjvBaNPEzfQWeb` is READY at
https://ewatrade-e4rg88iq7-ishaqyusufs-projects.vercel.app. Build logs show completed
build; no second deployment was issued to retry testing.

During that build, other source work committed66aecd5c0 (WhatsApp reply instructions),
293af0156 (marketing palette) and later mobile theme source. The root release
correctly exited1 with “Source moved during release; verification not accepted.”
It did not run matching smoke. This Preview is not Production acceptance, and no
Production push/deployment or purchase-recovery POST was performed. Last accepted
Production remains2d4424b1 / dpl_CRXkzyZQrtHSew3SWAFeuhv1tRyT.

Owner explicitly authorized coordinating a brief release freeze. Shared operation
message168d3877-3434-4343-8bf0-18888c22e57a was appended via AGENT_CHAT CLI. The
source and Workshop chats confirmed holds; neither owns the mobile theme/app.config/
onboarding changes. Their files remain untouched. Workshop's untracked receipt is
its own preserved work. Another writer's source ownership is still being clarified
with the owner before pinning/approving a final candidate. No worktree or branch
switch will be used to evade this condition.

Prepared private helpers are not yet executed against Production: signed original
notification recovery through the normal receiver, and distinct before-/after-recovery
read-only state captures. Preserve initial after-purchase/cancellation evidence.
No additional buy/restore request, fake receipt or manual grant was made. Public
checkoutfalse/WEB/no-private-TestFlight-OTA boundaries and Apple2/6 remain.

## Final web/API rollout and original-purchase recovery

The owner confirmed other chats paused and explicitly excluded mobile release.
The native implementation author completed only its checked local milestone and
confirmed a tracked-edit hold. Final clean main candidate:
`e047ed676fff074a4ec8e0627ddc3e579b9a7448`; billing correction remains454972d8c.
No worktree/branch switch was used for this final run.

Candidate checks:284tests/1813assertions and QA tooling types pass; H01 current;
H02 against prior accepted2d4424b1 passes8records with no capability/procedure
changes. Existing actual-capture red→green,23Apple/reviewer tests/169assertions
and API type evidence remain valid for unchanged verifier source. Native author
reports20focused tests, mobile types and14component UI checks, with its existing
Ask style-guard failure recorded separately; no native release acceptance is claimed.

Normal `release --preview --only dashboard,marketing,api --mobile skip --yes`
completed the three deployments. First smoke refused an old canonical Dashboard
identity; new deployment reported its correct alias assigned with no error.
Only qa:smoke was retried. The first browser attempt was blocked by macOS MachPort
registration inside the command sandbox before creating a page. The exact existing
runner with normal browser-launch permissions passed; no source/runner/fixture
change or redeployment was used to retry tests. Both failures remain captured in
private receipt copies.

Matching passed Preview receipt:
`.scratch/qa-release/smoke-e047ed676fff074a4ec8e0627ddc3e579b9a7448-preview-web.json`.
It proves existing QA login/exact profile, populated catalog, sale draft/total and
Cancel, without submitting a sale/payment. Runtime IDs: Dashboard
`dpl_CqJ7y2S5TDQtstmRzvLh9VFhAodn`, API `dpl_Hmgmbh7sbhTemAdoZP6oFNykM3xp`.
Marketing `dpl_HTSWXXCtM7xw5KLYFEQk37GxVv8F` was separately identity-verified
and visually inspected through its actual Preview URL; hero/CTA layout rendered.

Normal `release --production --only dashboard,marketing,api --mobile skip --yes`
completed0 and SQL-backed API health passed. At20:26:28.544Z, canonical provider
metadata independently verifies project/team, Production target, READY state and
exacte047ed676 source for all three:

| Surface | Canonical host | Production deployment |
| --- | --- | --- |
| Dashboard | dash.ewatrade.com | dpl_CrBPVUMwyyu2Fx17EW9qmV4RNGSp |
| Marketing | ewatrade.com | dpl_AnLvPeXbzVcbmCHZJV2K6LH59iaS |
| API | api.ewatrade.com | dpl_B7AtaDiHhKMJhqG5hHJYNAe7o4iY |

At20:26:40.371Z, an exact current ACTIVE OWNER membership / Production read-only
transaction still found zero owner purchases/subscription/coverage. The original
SUBSCRIBED capture was fully Sandbox signature/bundle/transaction re-verified,
then replayed once to `https://api.ewatrade.com/webhooks/store/apple` using only
its original signedPayload. Response at20:27:15.296Z: HTTP200, received:true.
No Apple purchase, replacement receipt, key, provider mutation or manual grant.

After-recovery read-only transaction at20:27:25.864Z proves:

- Exactly one owner purchase and one ACTIVE APP_STORE Starter subscription.
- Environment remains sandbox. The stored purchase and subscription digests each
  exactly match the original captured transaction chain, without exposing refs.
- Verified at20:27:14.526Z; paid period ends2026-11-09T19:26:34Z, renewal on.
- Zero coverage-history/active rows; canonical business plan remains Free.
  Subscription verification and explicit owner enrollment are separate commands.

This proves hosted key/API authentication and normal durable reviewer reconciliation,
not merely envelope delivery. The prior400/503 is recovered for this real purchase.
No second purchase or repeated Restore was requested. Owner has been asked to
refresh Plan & billing once and report verified subscription / Cover this business.
Native StoreKit finish, Restore idempotence, coverage/lifecycle, ordinary Sandbox
relay and API/Dashboard/jobs paid-reader consistency remain open.

Mobile build/upload/OTA is excluded; installed1.0.0(10), native source2d4424b1 and
runtime018c6c66e7e614408870451b744e5befac86a851 are unchanged. Jobs remain6a4948c8;
public checkoutfalse, WEB activation, legal/provider settings and existing records
are unchanged. Apple remains2/6 (33.3%). Other chats remain paused by the owner.

Brain impact: updated current BRAIN/task/native billing pointers, API contracts/
permissions, and both reviewer-environment decisions. No schema/migration update
is needed. Prevention: keep actual signed Sandbox capture/SDK proof paired with
the prelaunch Production401 regression; a mocked404-only response missed this case.

## Owner-reported app presentation — 9 November 2026

Owner reports the app's Business coverage section says this business is not
enrolled in the owner subscription and zero of one business slot is in use.
This confirms the visible verified-owner / uncovered-business presentation after
server recovery. Build identity and StoreKit finish were not reinspected in this
check; enrollment, Restore and lifecycle acceptance remain pending. No new live
read/write, purchase, restore or enrollment action was performed. Apple2/6 unchanged.

At the owner's request, selected Owner ledger v9 revision
`e33d8ec7-faa5-453c-a84b-f72d9ca5fb00` was opened in the shared Workshop at
**Verified · business uncovered**. Actual viewer shows Picked/Implemented, Starter
owner subscription,0of1slots, business stillFree and Cover this business. The tab
is retained for review. This is the local simulated presentation of the same case;
no new revision, selection, implementation or deployment occurred.

## Real installed-app enrollment and Restore — 9 November 2026

Owner explicitly clarified these actions occurred in the installed TestFlight app,
not the Workshop. First Cover tap appeared ineffective even after refresh; a second
tap succeeded. Owner then reports persistent Starter/₦5,000 per month at the top
and the Business coverage section still visible. Source confirms that section is
intentionally retained in owner-billing scope. Covered state replaces Cover with
Release and shows used slots. ₦5,000 is the existing native plan-reference label;
localized Apple offer/confirmation remains billing authority, and enrollment does
not create a second store purchase. No upper-card design change was made.

At08:32:39.489Z, the guarded exact-owner/business Production READ ONLY transaction
proves purchase count1; original digest match for purchase and ACTIVE Sandbox
Starter subscription; one coverage-history row and one active row, correct owner,
active owner slot count1; enrolled08:28:16.993Z; canonical plan Starter with source
owner_subscription. This corroborates persistent installed-app coverage, not a
simulator transition. The helper changes no records and exposes no identity/ref.

A fresh CLI metadata/log read could not authenticate; normal CLI refresh required
its own auth-file write, then returned missing-auth-token403. No new login/access
was granted. Read-only existing Vercel Chrome access succeeded. Its Runtime Logs
had no matching enrollment message; CDN Requests for09:05–09:34Lagos displayed
one POST `/api/trpc/storeSubscriptions.enrollBusiness`, HTTP200 at09:28:16.83.
No failed matching row was visible. This does not establish why the first tap
appeared inert; there is no red-capable reproduction of that first attempt.
Keep that QA item open. No speculative fix, live enrollment reset or release was
made to reproduce it. Current API deployment identity was not independently
rechecked this date; e047ed676 remains the last verified deployed source.

Owner was asked for ONE post-fix Restore, with no new purchase, and reports1of1
slots still used afterward. At08:39:19.318Z the same read-only proof establishes:

- Same one original purchase and ACTIVE Sandbox Starter subscription.
- verifiedAt advanced08:28:02.392Z→08:37:17.056Z; period unchanged through
  2026-11-09T19:26:34Z, auto-renew remains on.
- Same enrolledAt08:28:16.993Z; one coverage row, one active correct-owner row,
  one active owner slot, canonical Starter/source owner_subscription.

This accepts this Restore's durable preservation/no duplication result. It does
not prove native StoreKit finish, every Restore outcome or the new sheet UX.

Owner separately requests Restore and Release floating bottom sheets: immediate
processing, truthful completion confirmation, auto-close, owning-screen refresh
and scroll to top. Release needs prior confirmation explaining the freed slot,
Free limits, retained data and continuing store renewal. Errors/no purchase/store
finish/stale-scope outcomes must remain truthful. Request was delivered to existing
billing Workshop thread01a1bcaf-470c-7bf2-bce4-4ff54a73485e, which acknowledged it.
It retains the current top card/Usage and implemented baseline, latest benefits
work and immutable revision history; exact new revision approval precedes native
implementation/publication. That thread owns its design artifacts; this chat owns
runtime acceptance. No mobile release or runtime configuration was performed.

Current subchecks: original purchase recovery, explicit enrollment/persistent
Starter, and this Restore's no-duplication result pass. First-tap behavior and
StoreKit finish/further scope/lifecycle remain open. Overall Apple stays2/6.
Next independent gate is actual API/Dashboard/jobs paid-reader consistency, which
requires each hosted process's reviewed configuration and read-only evidence.

# iOS billing entry points — 8 November 2026

## Starter enrollment and Restore confirmed — 9 November 2026

The original TestFlight Starter Sandbox purchase is verified and saved. The owner
then enrolled this business in the installed TestFlight app and reports Starter
survives refresh. Exact scoped read-only checks confirm one purchase, one active
coverage row belonging to the same owner, one of one owner slots used, and the
canonical business plan Starter. The owner-reported first tap appeared ineffective;
second tap succeeded. Available CDN evidence shows one enrollment POST200; the
first-tap cause remains unproven and is an open QA note.

After one requested Restore and refresh, the owner reports one of one slots still
in use. The second scoped read proves verification advanced while the original
purchase/period, same enrollment row and Starter plan remained unchanged; no
purchase or coverage duplication. Native StoreKit finish, further coverage/account
switching and paid lifecycle acceptance remain separate open checks.

The coverage card intentionally remains visible for managing owner enrollment.
Release frees this business's slot and returns it to Free limits while preserving
records; store renewal continues until cancelled separately in the store. The
owner's requested Restore/Release floating-sheet progress/success/close/refresh/top
flow was handed to the existing billing Workshop thread, with its exact revision
review boundary retained. No live release action or mobile publication occurred.

Dashboard/jobs activation is deployed at clean `529a44998` after matching Preview
smoke and normal Production health9November. Both jobs projects promoted20261109.1;
Production has the exact existing reviewer1, Preview billing remains off. Canonical
Dashboard/Marketing are exact529; unchanged API retainse047 with verified component
source equivalence. Hosted settings/shared-reader reconstruction return Starter;
actual signed-in Dashboard SSR and task-local jobs reads remain open. Apple remains
**2/6 (33.3%)**. See the [reader activation receipt](2026-11-09-billing-reader-runtime-activation.md) for the precise proof boundary.
See the [verification receipt](2026-11-08-apple-purchase-verification.md).
Earlier checkpoints below retain their historical scope.

## Current signed follow-through

The correction shipped in private TestFlight1.0.0(10), exact native source
`2d4424b1525c4aa05e6ced39ce888e31d7f8140e`, EAS
`50f69a74-5dae-4d0a-b481-9ad6164146f4`. The first attempt consumed counter9 but
failed before archive upload/cloud acceptance on a sandbox Git-config write;
the authorized retry produced10. No accepted build9 is claimed.

Build10 finished, exact guarded upload exited0, Apple processed it Ready to Submit,
and only the existing internal group/one Account Holder tester was assigned.
IPA SHA256 `eb80bdb6c4bf52a93ab27ea4fe6cc52fec3c7a4bd1a201f33dfbaa9c00b63354`;
deep/strict signature, registered bundle/team, store profile, Production origins,
StoreKit/ExpoIap/OpenIAP markers pass. Owner subscriptions, Restore purchases and
Manage store subscriptions strings are absent in8 and present in10. All20 privacy
manifests are structurally equal to8, including GoogleSignIn9.2.0 declarations;
this is artifact evidence, not measured provider traffic or privacy acceptance.

Owner confirmed password login on8; login source/Production origins are unchanged
in10. After updating to10 the owner reported22.99/9.99/3.99; Mirroring confirms
Pro/Growth/Starter show those dollar prices every month. Currency ISO identity,
actual cancellation/purchase/restore and all signed lifecycle checks remain open.
Mirroring screenshot capture works but coordinate clicks fail even on unrelated
controls, so no click/transaction acceptance is inferred. Apple remains2/6.

The following sections retain the source-fix checkpoint and its then-pending work.

Apple remains **2/6**. Owner testing of build8 reached Free plan, usage and AI
usage but no upgrade controls. This exposed a source-routing defect, not a need
for another customer account. No purchase or paid acceptance occurred.

## Cause and correction

Metro prefers `.ios.tsx` over `.native.tsx`. Both iOS billing entry modules still
contained Android-only launch stubs: provider returned children with null context,
panel returned null. The enabled native release scope and linked IAP binary could
not override those explicit iOS modules. Earlier direct `.native` fixture tests
and artifact linkage checks did not exercise this entry path.

The existing iOS provider now re-exports StoreSubscriptionProvider and
useStoreSubscription from the shared native implementation. The iOS panel now
re-exports the shared native panel. No duplicate UI/provider or new feature flag.
Existing paid scope, native module, authenticated Owner/business, session/cache
fences, fresh server catalog/legal and purchase-binding gates remain authoritative.
The disabled-scope fixture explicitly mocks softwarePlanPurchases=false; its
meaning is independent of the current paid-launch scope.

## Verification and limits

An additional isolated wrapper imports actual `.ios` entries, runs the18 existing
controller cases and renders the real shared native panel within that provider.
It checks owner catalog, localized monthly offer and restore/manage controls with
no checkout. The old iOS stubs fail all19 cases; direct re-exports pass. Existing
shared controller, disabled-scope and coverage wrappers remain passing: four root
wrappers total, including19 iOS,18 shared,4 coverage and1 disabled-scope cases.
Mocked native/server/host-render evidence is not actual StoreKit or device proof.

No native capability/permission or server/schema change is needed for these
entry-point exports. The separate signed callback correction is224e6be99. Root's
local Preview wait for that commit was interrupted130 after its provider builds
were accepted; external Vercel builds were not cancelled. No Production224 rollout
or callback URL change occurred. Combine source into the next clean candidate
and use normal Preview/API→matching web smoke→Production gates.

Private Production TestFlight OTA is prohibited; keep that guard intact. Build9
must be compiled/uploaded and inspected, then the owner installs it and repeats
visible product, password, Sandbox purchase/restore and lifecycle checks. Build8
is superseded for paid testing; it may be used for login only. No public checkout,
App Review submission or private-purchase acceptance is granted by this fix.

Assistant impact remains form-only through existing canonical billing commands;
no new permission, procedure or entitlement authority. Brain feature/task/current
pointers updated locally; prior database/verification evidence retains its limits.

Final source checks: full mobile TypeScript passed with16GB heap; own nine-path
fast smoke passed284/1813 plus tooling types/Biome and zero unsupported mapping;
H02 passed with no capability/procedure changes. Four isolated wrappers passed
with their existing/native/iOS child cases as above. H01 unchanged800/604 is reused
from the immediately preceding callback correction because no merchant API or
assistant manifest changed. No extra device/viewport/theme matrix was run.

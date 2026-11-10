# Business Phase 1 continuation — 10 November 2026

Owner: chat `01a1c532-df8a-7aa3-9bdd-8a863c230a73`, T1–T3.
Continues the [takeover](2026-11-10-five-phase-takeover.md), existing implementations
and selected designs in the shared main checkout. No worktree or branch change.
Phase 5 owns the case register and connected acceptance windows; this report does
not promote a case or claim launch completion.

## Checklist and current scope

- [x] Recover T1 canonical shipment commands (`36e095785`, `cdcad01bb`), T2 lookup
  and UI (`0734a5f80`, `34f44bd25`, `c1365947a`) and T3 links (`ed975340c`).
- [x] Reuse source-specific staff and scanner-lifetime proof from `7f06ca525` and
  `4666bc03f`; relevant source and lock hashes below remain unchanged.
- [x] Resolve `EwaTrade_Assistant_QA` to `emulator-5556`; leave GreenTill_API34
  (`emulator-5554`) alone. No emulator launch, app install, data clear or build.
- [x] Diagnose runner setup, reach actual native flow execution, and retain its
  failed receipt rather than treating initialization or partial steps as a pass.
- [x] Confirm exact Workshop selection and source linkage; implementation receipt
  remains pending integrated device acceptance.
- [ ] Retry the standard smoke after the catalog wait repair, on a responsive
  assigned runtime and within a newly acknowledged Phase 5 source window.
- [ ] Complete T2 camera decode/found/repeat/shared-code/unknown/QR-link/denied
  recovery without saving a sale or inventing catalog fixtures.
- [ ] T1 merchant-approved shipment acceptance and T3 verified HTTPS links remain
  separate dependencies. Phase 2 owns shipment UI follow-through.

Existing T1–T3 source delivery is 3/3; final acceptance remains open for all three.
The historical aggregate remains 6/72 local passes (8.3%), 1 failed, 47 blocked,
18 not assessed, subject to Phase 5's authoritative later register updates.

## Runner diagnosis and actual failed smoke

Run ID: `2026-11-10-business-phase-1`. Initial source `2ecf668cc`; the coordinator
committed its registry before the native window, so the actual run pinned
`585842939c3fd7e355b47290f717af787193f921`. Existing foreign WIP and shared Agent
Chat history were preserved. Phase 5 obtained explicit holds from every phase and
the coordinator, with a maximum interval 11:27:33Z–11:37:33Z. This run ended early.

- Offline doctor passed. Initial connected doctor without the Portless CA failed
  API TLS probes. The documented `NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"`
  invocation passed API/database/QA/Metro and the no-launch Android connection.
  This verifies local readiness, not running source identity or acceptance.
- Maestro 2.12.0 under the sandbox reproduced an `applesimutils` permission-change
  error during dependency unpacking. Normal outside-sandbox version/help and
  assigned-device hierarchy succeeded. No shared process was killed/restarted.
  The older selected-device initialization stall did not recur in this run.
- Standard command: `NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem" bun run qa:smoke
  --target local --surface android --config
  .scratch/qa-release/smoke-five-phase-takeover.json` outside the sandbox.
- Actual interval: **11:28:00.752Z–11:31:05.023Z** (12:28–12:31 WAT).
  Normal launch, sign-out, runtime detail check, existing Jawdah Poultry QA Owner
  selection and catalog navigation executed. The catalog's 20-second scroll
  failed: `No visible element found: "Snail QA7Oct"`.
- The final failure screenshot visibly contains the exact Snail QA7Oct row,
  30 Piece, ₦1,500, after four scrolls. This supports a deadline problem on the
  longer existing directory, not missing business data. Only that bounded catalog
  scroll wait changes from 20 to 60 seconds. Exact text, centering, visibility,
  subsequent assertion and no-write/permission-preservation flow remain intact.
  A fresh standard retry is required; the source change alone proves no UI pass.
- Receipt: `.scratch/qa-release/smoke-585842939c3fd7e355b47290f717af787193f921-local-android.json`:
  **failed**, `clean:false`, `runtimeVerified:false`, `checks:[]`.
  Config/toolkit hash `ef25c803584176039b89453ba874ebb40e4131425d3cf63096c0e13ce97d4b72`.
  Artifacts: `.scratch/qa-release/artifacts/950572d9-830b-468c-b95d-65aa2431843b/`.
  The earlier failed zero-check receipt is retained separately in the takeover.

No order, sale, payment, fixture, provider message, publication, hosted setting,
build, upload, OTA, push, merge or deployment occurred. The flow stopped before
sale entry. The source window was released early through Phase 5.

## Scanner and Workshop linkage

Shared catalog `show` independently returned the selected immutable revision
`5ba429f8-869c-4992-ad30-71c818910d72`, v24, archive direction, under
`ewatrade/legacy/mobile-quality-workshop`. Its brief identifies screen 02 Create
sale v2 direction 01: scan inside Search items, direct draft addition with Undo,
repeat increments, shared-code chooser and explicit recovery states. The selection
event is `beb0fe1e-f513-4f79-b4d8-e8a91f8dbeb5`. Its four implementation records
cover older screens/revisions; none covers this scanner revision.

Current `use-sale-scan.ts` explicitly names this screen/direction. Existing source
reuses the search footer, exact Business lookup, offering choice, draft mutation,
Undo and session cancellation. Camera allowlist includes QR; link outcomes never
open a URL. Actual assigned-emulator observation showed the Scan to add camera,
photo/manual fallback and return to an empty New sale draft (Claude Web Test
Farms/Main store, 29 existing offerings). A virtual-scene poster placement attempt
did not decode; it is **not** QR/link/found proof. Camera permissions were unchanged.
No catalog implementation record is appended from these partial observations.

Permanent review: https://workshop.localhost/ewatrade/legacy/mobile-quality-workshop

### Focused follow-through and remaining native gate

The checked catalog-wait repair and initial report were committed at `1093df64e`.
Phase 5's subsequent bounded read-only reconciliation found 30 active unit
offerings, six distinct nonnull SKUs and zero barcodes for the existing Claude Web
Test Farms catalog. `BRL-LIVE` and `EGG-MED-01` exist; there was no shared-code
collision in that result (100-row bound was not reached). No code/product fixture
was created. This establishes eligible saved codes, not camera decoding.

A temporary focused setup used normal sign-out and the existing QA chooser. It
stopped before choosing the farm: Android reported an actual input-dispatch ANR
at **12:36:26 WAT**, waiting 7,531 ms for a MotionEvent. Hierarchy and screenshot
reads slowed while ordinary ADB shell remained responsive. The setup also used
the wrong scroll direction from the chooser's top; that setup error is not a
product defect. Only its verified owned Maestro Java process was stopped; its
final exit was 143. Its private diagnostics remain under
`/private/tmp/ewa-phase1-scanner-setup/2026-11-10_123402/`. A captured Java stack
showed a pending driver `viewHierarchy` call. This does not identify a product
source root cause, and no native product fix was made from it.

The documented Dev-client reconnect passed transport/API/Metro/QA but the app
initially showed splash/blank startup. After coordination through Agent Chat, one
data-preserving restart of **only** EwaTrade_Assistant_QA/5556 used the documented
`-gpu swiftshader -feature -Vulkan -no-snapshot-load -no-snapshot-save` flags.
The same AVD's QA profiles/data persisted. GreenTill_API34/5554 and shared API and
Metro services were untouched. The new managed emulator session is retained as
`5522`; no app installation, native build or data wipe occurred.

After boot/reconnect, actual login, existing QA chooser, farm Owner session,
loaded Home and an unsaved New sale screen rendered. Normal New sale and scan
button taps reached **Opening camera**. Screenshot reads again stalled at that
point; guest load was 10.41. The post-boot ANR query explicitly reported **no ANR
since boot**; do not misreport this delay as another observed ANR. The attempt
decoded no code and added no line. Temporary generated QR images were camera
input only, with no catalog/database fixture; poster placement did not establish
decode behavior. A queued local gRPC rotation helper was never executed: its
owning pending screenshot/rotation command was stopped (exit 143).

Cleanup restored the default wall poster (`OK`). The Dev app force-stop request
timed out, so app closure was initially unconfirmed; a subsequent assigned-device
PID read returned no Dev app process. No active Maestro flow or queued rotation
remains; a subsequent explicit state query confirmed `stopped`. Camera
permission was never changed; denied/recovery remains untested. No second generic
smoke, source hold, passing receipt or Workshop implementation record was created.
Phase 5 received the failure, correction and remaining gate through Agent Chat.
Eight valid private native screenshots and a qualified `observations.json` are
retained under `.scratch/mobile-sales-quality/runs/2026-11-10-business-phase-1/`.

**Next dependency:** a responsive assigned native runtime, then a fresh explicitly
acknowledged source window for `qa:smoke` and the separate scanner outcomes. There
is no shared-code data for that device case, and merchant shipment/build/public
association gates remain as documented. Repeated recovery loops, a different
project's emulator, fabricated catalog data or a deployment cannot replace proof.

## T3 missing target evidence

Earlier custom-scheme sign-in/exact-record/foreign-business refusal and web login
redirect proof remain valid only in their documented scope. An actual
`adb -s emulator-5556 shell pm get-app-links com.ewatrade.dev` read shows only
`chat.ewatrade.com` at state 1024; there is no dashboard saved-product association.
No app-link setting was modified. Local `.localhost` configuration deliberately
does not emit a publicly verifiable dashboard host.

To close verified HTTPS delivery, the authorized target must supply:

1. A rebuilt native artifact containing the intended public dashboard host,
   `/open/catalog-item/` Android path prefix and iOS associated-domain entitlement.
   Record actual package/bundle identity, signer and immutable build/source IDs.
2. Public HTTPS `/.well-known/assetlinks.json` and
   `/.well-known/apple-app-site-association` matching that artifact's actual
   identity/signer and saved-product path. The existing association variables are
   `EWATRADE_ANDROID_APP_LINK_PACKAGE_NAMES`,
   `EWATRADE_ANDROID_APP_LINK_CERTIFICATE_SHA256` and
   `EWATRADE_APPLE_APP_SITE_ASSOCIATION_APP_IDS`. Merely setting source/env values
   does not prove public hosting, OS verification or an installed entitlement.
3. OS verification state and an actual external HTTPS tap to the exact record,
   signed-out continuation, authenticated scoped read, foreign-record refusal and
   web fallback on an appropriate target. Custom schemes cannot substitute.

These build/public-host/target steps are outside this task's authority. No provider
or deployment approval is inferred from catalog selection or local smoke.

## Source fingerprints and verification

SHA-256 at the actual native run:

| Path | SHA-256 |
| --- | --- |
| `apps/mobile/src/components/mobile/create-sale/use-sale-scan.ts` | `390efdd5acc78746ac9d0c9c68f29112745165209ef4d10bef0054661d2f9c43` |
| `apps/mobile/src/components/mobile/create-sale/sale-scan.tsx` | `e57407854c22704f64495da40bcf5f8f9012077c6b082fc3efc44a51e6a54185` |
| `apps/mobile/src/lib/barcode-scan.ts` | `faf7e7c5b89fb85fd3b615e6e0bc79ce3aade07c24c46180398387eb5c8b5d2c` |
| `apps/mobile/src/components/mobile/barcode-camera-screen.tsx` | `4988fa5feb7944ca9e0603a07055c86c5b8b78c98c21323f07ed0db43b9a8ac7` |
| `bun.lock` | `05bbb4dda2da05b9a80add9e9608e2d2b47f4943c3a0872929c7efe9c58c3348` |

Owned-path quick plan selects only the existing core smoke and has zero unknown
mappings; it excludes concurrent shipment/catalog/channel edits. Its execution
passed **51 tests / 254 assertions** and QA tooling types. Maestro's installed
`check-syntax .maestro/smoke.yaml` returned **OK**. Owned whitespace review passed.
This is source/syntax proof, not the required native retry. H01 source metadata
is unchanged; existing first-slice classification evidence is reused. Brain impact:
local-only `.brain/tasks/2026-11-10-business-phase-1.md`; shared summaries remain
with the coordinator. The harness change adds no capability/API/schema behavior.

The post-commit CI H02 command with base `1093df64e^` passed across this milestone
and the three subsequently committed peer impact records: zero capability or
procedure rows changed. This is explicitly the combined committed range, not a
claim that this phase authored those records. Final scanner/lock fingerprints
match the table above; unchanged source checks were reused for this evidence-only
append. Source milestone `1093df64e` is committed; this final evidence append is a
separate local documentation milestone. No push or deployment is authorized.

## Loading-camera manual-search repair — narrowed follow-through

The coordinator relayed the owner's smaller market-ready target: one ordinary
scan and a safe manual-search fallback, without another emulator matrix or
recovery loop. Source review found a concrete gap matching the observed
**Opening camera…** state: its Suspense fallback contained only that notice.
The explicit manual-search action was inside the camera module that had not yet
resolved. The existing header close was available, but the named search recovery
was not.

`SaleScanLayers` now renders the existing **Search by name instead** ActionButton
while the camera is loading. It calls the unchanged `scan.searchByName`, which
cancels the scanner session, closes scanning and requests focus on the existing
floating search footer. No new input, loading framework, camera retry, permission,
catalog command, sale submission or assistant capability is introduced.

The existing isolated mounted fixture now also renders the actual scanner layer
with the actual hook and an inert suspended camera/native UI port. Before the
repair, seven controls passed and this regression failed: only Opening camera
was rendered. After repair, **eight child cases / 21 assertions pass**. The new
case invokes the rendered action and verifies closed scanning, one search-focus
request, no failure notice and no item addition. This is actual React/source
execution, not a device keyboard or camera decode pass. Existing ordinary found
lookup and cancellation controls remain in the same fixture.

The useful source repair is finished independently of unproven camera/shared-code
scenarios. Recommend retaining ordinary manual sale entry as the usable path and
not claiming scanner readiness until a representative decode is observed on a
responsive authorized device. The full 72-case matrix is not a condition for this
small source slice. No device/connected test, provider action, repeated app type
matrix or additional host recovery was performed for this follow-through.

Ready-milestone verification: the exact-JUnit wrapper and unchanged scan model
pass **4 tests / 24 outer assertions**, proving all eight child cases ran without
skips/failures. One five-owned-path quick smoke passes **285 tests / 1,820
assertions**, QA tooling types and changed-file Biome, with zero unknown mappings;
it excludes concurrent T10 source. Scoped mobile ESLint reports zero errors and
one pre-existing chooser-effect dependency warning on the unchanged effect.
Whitespace review passes. No whole-app type or repeated device matrix was needed
for this existing-control/callback addition; previous unchanged evidence is reused.
Assistant impact is recorded in `2026-11-10-scanner-loading-fallback.json` with
unchanged form-only classification and no capability/procedure rows added.

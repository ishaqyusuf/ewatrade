# Five-phase business feature takeover — 10 November 2026

**Current checkpoint:** Phase3 committed guarded native-sale source in
`c85d5ff4f`; paid confirmation still fails the required30s transaction limit.
Native sales remain default-off, with no T10 Workshop implementation receipt or
paid/Cashier/replay acceptance. Phases1,2,4 have committed focused source repairs.
The earlier plan-only checkpoints below remain history; current scope and remaining
work are recorded at the end. No hosted release is accepted.

Codex took over the owner's **Business feature inventory and prioritization**
work in chat `01a1c511-a483-75b0-b017-0152cab33c12`. The original Claude parent
(`d84112c9-01e5-4630-addc-816ec58a72a5`) and its Phase 1/5 transcripts were read,
alongside each phase's committed handoff in the
[gap tickets](../../.brain/tasks/2026-11-09-four-business-gap-tickets.md).
This continues the same five phases and approved designs in the main checkout.
No worktree, branch change, deployment or provider action is included.

## Recovered checklist

| Phase | Existing delivery | Remaining acceptance |
| --- | --- | --- |
| 1: T1–T3 | Shipment commands `cdcad01bb`; code lookup `0734a5f80`; app links `ed975340c`; sale scan UI `34f44bd25` and focus repair `c1365947a` | Scanner camera/found/repeat/ambiguous/unknown/link/denied run; exact Workshop implementation receipt; verified HTTPS app/universal links require a rebuilt native artifact and public association host. Prior custom-scheme emulator proof remains scoped. |
| 2: T4 | Dashboard `27a53202f`, mobile `623e90e8d`, final Store-source fix `f2e296168`; approved Workshop direction 01 implemented | UI create/confirm/adjust/price/partial receive against approved shipment data; earlier list/form/refusal checks and T1 integration evidence remain valid in their scope. |
| 3: T5–T7 | Products `082595e9a`; laundry/shipments `1e6672a17`; integrations `6b092d7ca`, `b37a2ac4f`; Workshop implementation recorded | Retain approved conversations v13/v14 and the documented implementation deviations. Target runtime acceptance remains open; the newer current-review-surface and earlier local-only Site instructions are recorded below. Native review actions remain off outside local unless explicitly configured; no real phone send is authorized here. |
| 4: T8 | Host-aware sharing `040643915`; opt-in listing `92db83673`; pages/settings `a99965941`; local preview `4a882e82d`; Workshop recorded | Store/product listing controls now read-verified below; save/refetch consent changes, product photos/WhatsApp buttons and existing no-site payment/tracking examples remain. Preserve consent, private audience and approved direction 01. |
| 5: T9 | Historical/local runs through `ee74dbc2a`; six local passes | J06 repair follow-through; J11 existing payment-link journey; remaining poultry/laundry checks; merchant-approved Hypnos/Alhaq catalog and shipment data; T10 fully native WhatsApp catalog-sale plan (owner choice, implementation pending); selected hosted candidate/provider/native gates. |

The scorecard remains **6/72 local passes, 1 failed, 47 blocked, 18 not assessed**.
This is not hosted launch acceptance. Merchant-data cases stay blocked per the
owner's existing instruction; no invented retail product list or shipment is used.
[Current case register](2026-11-09-business-journey-launch-register.csv) and
[acceptance run](2026-11-09-four-business-acceptance-run.md) remain authoritative.

## First repair: scoped cashier reads

The real `scopeStaffRequest` middleware refused `orders.paymentAccounts`, although
cashiers can record payments and the canonical query deliberately returns receiving
account names/settings without balances. The new `catalog.findByCode` scanner
query was also absent from the exact staff procedure map. Owner-only router tests
had not exposed scoped-staff admission.

Two new regression tests failed before the repair: the exact query policy returned
`null`, and the cashier middleware threw `FORBIDDEN`. Adding only those two paths
to query reads makes the same tests pass. The shared middleware still requires
active Store assignment, refuses foreign Store input and revoked grants, preserves
leading-zero codes and undefined no-input requests, and permits neither a mutation
nor an unknown/similarly named procedure. Domain guards and tenant/currency-derived
receiving-account projection are unchanged. No Finance administration is opened.

The normal validated H01 generator changes exactly two staff-admission cells in
`COVERAGE.md` from Owner/Admin only to read. Scanner classification stays
`form_only`; receiving accounts stay `planned` for assistant support. No manifest,
channel tool, rollout or live capability was added.

## Focused verification

Run ID: `2026-11-10-five-phase-takeover`. Initial source `39ada60cd`; a peer's
Android documentation commit advanced HEAD to `fdea9c2d6` during this work.
Peer changes and the pre-existing `AGENT_CHAT.md` diff are excluded from the commit.

- Offline QA doctor passed. Local API/database/QA and dashboard doctor passed;
  these do not certify source SHA, native runtime or release readiness.
- Before repair: two regression failures, 22 passes. After repair: **24 tests /
  129 assertions**, no failures, across the exact staff policy and middleware suites.
- Full API TypeScript check passed. Changed source/test Biome passed.
- Actual local browser, existing **Jawdah Poultry Acceptance / CASHIER**:
  ORD-001's Details and full page rendered the correct saved order; direct reload
  rendered it again. The previously reported full-page hang was not reproduced.
  New order → Paid in full displayed **Received into: Shop cash**, instead of
  "Payment accounts could not load". The unsaved draft was closed; the list still
  contained one order. No order/payment was submitted, no fixture was created and
  no customer message was sent. This proves account-choice admission, not saved
  cashier payment acceptance; J06 remains FAIL pending that remaining proof.
- Scoped `test:quick --files` for the six owned tracked paths passed **285 tests /
  1,820 assertions**, QA tooling types and Biome, with zero unknown mappings.
  This excludes concurrent work and does not typecheck other application graphs.
- H01 initially failed because the real staff-admission change made its snapshot
  stale. Validated regeneration changed exactly the two expected admission cells;
  the actual local-profile H01 check then passed. H02 passed: one permission record,
  zero capability changes and two explicitly named procedure changes.
- Standard existing-data `qa:smoke --target local --surface web` passed using the
  existing Jawdah Poultry QA / Snail QA7Oct configuration (catalog → unsaved order
  draft total → cancellation). The first sandbox attempt exited before a browser
  page existed; the same command passed outside the sandbox. No provider/deployment
  retry occurred. Receipt:
  `.scratch/qa-release/smoke-fdea9c2d6df782c209edb144243cd164133bda61-local-web.json`.
  Its `clean:false` and `runtimeVerified:false` flags are retained: local dirty-source
  development evidence cannot qualify a hosted candidate.

Remaining money/permission/concurrency, native compatibility, target release and
human approval requirements are retained. Earlier phase test receipts are reused
for unchanged source; this takeover does not multiply those checks.

Brain impact: local `.brain/features/staff-store-access.md`,
`.brain/api/permissions.md`, `.brain/tasks/2026-11-09-four-business-gap-tickets.md`
and `.brain/tasks/in-progress.md`. These are ignored project memory, not claimed
as files checked by CI.

## Source fingerprints at verification

SHA-256 (source was dirty over `fdea9c2d6`; committed result follows in Git):

- `apps/api/src/utils/staff-procedure-policy.ts`: `b2eacd6d3a637cd6664b9713ed7d2c338bb7ba7a20e63d86ec714f64dd0c3f9c`
- `apps/api/src/utils/staff-procedure-policy.test.ts`: `30aa3650e6f4ffe56e76a464262bb419cd9f0d4d877c4c01240a036b7c1f1eb4`
- `apps/api/src/utils/staff-request-access.test.ts`: `178d6559b042572aca655b239d007a8310d6ca1c1a3442d1436f8396bbe93582`
- `packages/assistant/src/capabilities/COVERAGE.md`: `8afb08762ac9cb17c4c410ad4d6ee8e4562d0884465250661927b5e7ad03f651`
- `bun.lock`: `05bbb4dda2da05b9a80add9e9608e2d2b47f4943c3a0872929c7efe9c58c3348`


## Public-catalog controls: additional read-only proof

Existing **Storefront Link Test 21 Oct / OWNER**, local dashboard: Settings → Stores
shows **Business page on ẸwáTrade**, its enabled Main store switch and
`ewatrade.localhost/b/storefront-link-test-21-oct-qa`. Catalog → Beaded Necklace
(QA) → More → Storefront settings shows **Show on your business page**, currently
off, and its explanation that a Store must be listed and the website is unchanged.
Save remains disabled. The sheet was closed without editing either switch.
This closes the missing control-rendering check; it does not prove save/refetch,
publish new data or satisfy the merchant-specific retail cases.

The relevant Brain feature explicitly records the owner's 2 November replacement
review surface `assistant/conversations`; Phase 3 used that existing collection,
not an invented standalone demo. Its v13/v14 design/implementation handoffs remain
preserved. The same feature also records an earlier owner instruction to keep
updates local and leave the private Site unchanged. Those records qualify the
older general mirror rule; this takeover has made no Workshop/Site publication or
selection, changed audience or rewritten archived `whatsapp-system` case history.
The newer library labels its T5–T7 scenes proposed; catalog implementation receipts
and local source are distinct from live availability. Actual target review remains.

## Scanner cancellation: second source repair

The actual `useSaleScan` hook checked its lifetime after fetching the item, but
then awaited `tenant.featureAvailability` and could add that offering after the
scanner closed, switched to name search, reopened or its owner unmounted. A failed
shared-code item read could also restore a failure notice after cancellation.
A mounted real-hook reproduction failed **four cases**, with the ordinary current
lookup control passing. This tests draft mutation and visible notice state, not a
copied scanner model.

A final session check after the dependent reads now precedes any notice or draft
update. Shared-code selection captures its current session and only reports its
error while that session is still current. Existing current lookup/error behavior,
quantities, schema, native camera, layout and search-footer components are unchanged.
The final isolated fixture passes **seven cases / 14 assertions**, including reopen
and current-error controls. Its wrapper verifies the exact seven JUnit test names,
no skips/failures, in an inert separate Bun process. Wrapper plus existing scan model
checks pass **4 tests / 23 outer assertions**. Full mobile TypeScript passes.
These are React/hook execution checks; real camera decode and device permissions
are separate and remain pending. No business/provider write or schema change.

Scanner source SHA-256 at verification:

- `apps/mobile/src/components/mobile/create-sale/use-sale-scan.ts`: `390efdd5acc78746ac9d0c9c68f29112745165209ef4d10bef0054661d2f9c43`
- `apps/mobile/src/components/mobile/create-sale/use-sale-scan.fixture.tsx`: `ac41febb0e922502fde999fe32f099d13c04522df57887701419d48bebb874bc`
- `apps/mobile/src/components/mobile/create-sale/use-sale-scan.test.ts`: `00109e14a70fa8142cae41a6be0ec6a7fbb446ca89ebe7ee4d72fde50ba471e5`

Second-slice scoped quick smoke (seven owned source/test/impact/acceptance paths)
passes 285/1,820 plus QA tooling types/Biome, with zero unknown mappings. It
excludes peer iOS proposal and Agent Chat changes. H01 from the first slice remains
valid: this hook changes no router or staff-admission metadata. Current H02 passes
one client record with zero procedure/capability changes. Case-register integrity
and local documentation links pass; all 72 case statuses are unchanged.


Native follow-through: `EwaTrade_Assistant_QA` was resolved to `emulator-5556`.
The existing no-launch doctor passed API/Metro/QA and reverse mappings without
opening the app. Standard `qa:smoke --surface android` first failed at Maestro's
helper extraction under the sandbox. Its normal outside-sandbox retry reached
runner initialization, but produced no flow report or checks. During that wait,
peer documentation commit `b57ee3daf` changed HEAD from `7f06ca525`, invalidating
any eventual candidate receipt under the existing source-drift guard. Only this
attempt's verified Java child was terminated; its parent saved **failed**, zero
checks, `runtimeVerified:false`. No emulator/app state was cleared or permission
changed. The run is not native acceptance and was not replaced by a deployment.

Failed receipt:
`.scratch/qa-release/smoke-7f06ca525b6519585218150dec8a8d40f0b5715f-local-android.json`.
A stable source window and a responsive Maestro flow are needed before repeating
that device check. Actual camera decode/permission/found/repeated/ambiguous/unknown/
link checks remain open; the hook fixtures do not substitute for them.
Scoped mobile ESLint passed. Source review/whitespace checks passed; ordinary
unchanged types/source gates were not repeated merely for documentation updates.


## R23 scope decision: T10 native catalog-sale plan

Owner chose “Plan fully native WhatsApp sales.” [T10](../plans/2026-11-10-whatsapp-native-catalog-sales.md)
now fills the previously unticketed R23 gap in Phase3, without replacing current
app review or changing any runtime. It specifies exact canonical choices, complete
native review (including bounded larger Orders), explicit confirmation, scoped
initial-payment authority, atomic stock/money and retry recovery. Six implementation
slices and ten outcome checks are reviewable. No source implementation/design
publication or release was performed for this planning addition; all72statuses stay.

## Subsequent T10 authorization

The coordinator verified the direct human reply in Phase3 message
`01a1c541-5e1a-7b83-8db3-ca940a2bb8a2`: “Select v17 and authorize T10 product
implementation.” It selects conversations **01 Library v17**, exact revision
`d329aac5-7648-450c-a4bd-4218b4a1b36b`. Phase3 is implementing the existing
[T10 plan](../plans/2026-11-10-whatsapp-native-catalog-sales.md); the earlier
unselected/product-code gate is superseded. Review/provider/release boundaries,
merchant data and all 72 case statuses remain distinct. Phase5's verified
record is `2426fe6f2`; H23/A23 remain blocked pending actual native canonical
Order/stock/payment/replay evidence. Nothing is deployed by this update.

## Managed-phase source checkpoint and practical remainder

The owner requires all progress and important questions in the coordinator chat;
managed chats are implementation/evidence workers, not additional owner inboxes.
Routine decisions stay with the coordinator. The72-case register is coverage,
not a72/72 prerequisite for assessing a small first pilot.

| Phase | Committed source/checkpoint | Practical remainder |
| --- | --- | --- |
|1|`1f3234316`: existing manual search escape during scanner loading; real hook/layer checks pass. Earlier lifetime repair remains valid.|Use manual search/code entry for a pilot. Camera decode and HTTPS native associations remain unproved; no further emulator recovery loop without new evidence.|
|2|`6845ba652`: exact fractional arrivals validated before mutation; price rows preflighted and partial saves reported accurately; focused checks pass.|Actual shipment journey needs approved supplier/items/quantities/costs/freight/dated FX if shipments are in the pilot. Separate price commands are not an atomic batch.|
|3|`c85d5ff4f`: exact native catalog choices/review pages, delivered-page proof, same-Order payment authority, canonical confirmation and bounded duplicate-read repairs; focused16tests/224assertions, strict API/DB types and metadata gates pass.|Paid four-line confirmation still failsP2028. Paid/Cashier/replay and T10 implementation remain unaccepted. No further speculative patch/connected loop;30s policy and practical priority require a coordinator decision.|
|4|`923c7e98f`: trusted share scope binds to the same listed active Store as the anonymous loader; focused checks pass.|Existing eligible media/contact/no-Site examples and consent save/refetch need real inputs/permission. No listing or public-media consent inferred.|
|5|Evidence commits through`0b2cc8c15`, with the final isolated outcome supplied for reconciliation.|Own the stable register, actual target/candidate evidence and practical blocker list; source checks do not promote merchant cases.|

The final isolated partial four-line paid probe failed0pass/1fail/2filtered/
38assertions in169.22s (169.36souter): `StockOperation.findUnique` at30,751ms.
ACTION wall30,755ms,142SQL/30,565ms, pool0.178ms; review2,856ms and failing execution
19,230ms. SQL includes database and transport time; phases overlap and failed
workloads stop at different operations, so counts are not completed-command
performance comparisons. Strict owned cleanup, zero-owned assertions,
externalCalls0 and frozen-source equality pass. Temporary diagnostics were restored
byte-for-byte and omitted from the commit. Cancellation/stale no-effect proof is
reused from the earlier passing case. [Exact source, attempts and limits](2026-11-10-whatsapp-native-catalog-sale.md).

Independent coordinator review found no blocking source issue in the reviewed
guarded implementation, but explicitly does not accept its paid behavior. The
repository requires bounded30s interactive transactions; the WhatsApp job and
turn lease are180s. Neither policy was changed, and longer per-attempt work cannot
be considered independently of retry/lease budgets. No timeout exception, provider
action, live flag, native artifact or deployment is authorized by this checkpoint.

Practical market recommendation: assess a small app/manual-entry pilot with an
approved dataset and selected target; do not advertise native paid WhatsApp or
verified scanning. Full50-product stress catalogs and rare-code coverage can wait.
Hypnos/Alhaq products/options/units/NGN prices/opening stock remain owner inputs;
photos/public consent and shipment data are needed only for the selected scope.
J06 saved cashier payment and J11 public payment/report/retry remain real acceptance
items, not permission to manufacture fixtures or payments during UI smoke. The
original fully-native requirement remains outstanding; app handoff does not satisfy
R23. All72statuses remain6PASS/1FAIL/47BLOCKED/18NOT_ASSESSED.

Brain impact: local `.brain/tasks/2026-11-10-business-phase-coordination.md`,
`.brain/tasks/in-progress.md` and `.brain/tasks/2026-11-09-four-business-gap-tickets.md`.
Phase3 additionally updated local WhatsApp feature, API contracts/permissions,
native-review ADR and phase task. No schema/migration change.

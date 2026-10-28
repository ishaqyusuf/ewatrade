# Shared storefront features extraction

Owner authorized implementation on 28 October 2026 in the current main checkout.
Local source and verification only; no push, publication, deployment or provider
activation. Each completed phase is committed separately. Progress counts the 27
work packages below, not tests or acceptance assertions.

## Architecture contract

Templates own shell, editorial composition and presentation adapters. Contracts
own serializable views and validated configuration. Runtime owns reusable customer
interaction and UI. The storefront app owns routes, sessions and action adapters.
Existing domain queries/commands retain all authorization and persistence. Runtime
must not import templates, app internals, DB clients or provider credentials.

Reuse the existing contracts/runtime/templates packages. The generated component
SDK remains isolated from trusted login, bag and checkout implementations. Use
explicit package subpath exports, one persistent business-scoped bag owner, fresh
route data and theme propagation to portals. Shared features use existing shadcn
wrappers. Midday public login/OTP, public token invoice wrapper and explicit invoice
package exports are the layering references; EwaTrade's identity/domain rules stay
authoritative. Dashboard tables/bulk actions are outside this customer extraction.

## Baseline and ownership

Initial HEAD: 845776373. Current checkout: main at the repository root, not a new
worktree. Catalog photos, catalog storefront policy, preferred-time/service intake,
notifications and assistant coverage have concurrent work. Initial bytes/hashes and
the existing staged diff are preserved under /tmp/ewatrade-shared-storefront-baseline.
Never stage those pre-existing changes. Recheck current bytes before shared edits;
stage only this task's delta. Preserve ongoing product/service semantics rather
than copying an older committed version over them.

Source observations: app account/checkout/receipt routes and shell select
commerce-studio; the context, account and receipt UI live in that template;
ORDERING_TEMPLATE_KEYS controls ordering and customer scope; fulfilment settings
come from commerce-studio-header. Existing domain writers and host action adapters
already exist and must be reused.

## Invariants and compatibility

- Receipt paths/tokens, customer IDs, host-only cookie, signing formats and request
  references remain valid; business identity never becomes cross-merchant identity.
- Bag storage key/serialization and submission idempotency/recovery stay compatible.
- Guest ordering remains independent of login. Preview never sends or saves.
- Verified Host -> published primary Site -> active release -> Store checks remain.
- Separate new intake, login, session/history reads, receipt reads and request actions.
  Disabling intake or changing template must not erase valid customer continuity.
- All effects recheck current server policy; rendering flags are not authorization.
- Request receipt != confirmed order != verified payment != confirmed appointment.
- Preserve immutable release JSON/hashes and exact template pins. No implicit saved
  draft upgrade. Use normal CAS/save/consent/publish/rollback commands.
- Operational settings move to versioned template-neutral composition configuration;
  readers precede writers, legacy values normalize without writes. New JSON schema
  versions must be explicit. No SQL migration is expected for existing JSON fields.
- Product/gallery/book-ahead/preferred-time changes from other owners are retained.
- New appearances use the canonical Workshop template library, stable direction
  keys and exact owner-approved revisions before product visual implementation.

## Stable execution checklist

### Phase 0 — baseline and compatibility
- [x] P0.1 Record baseline and overlapping ownership without changing other work.
- [x] P0.2 Define operation/compatibility matrix and reusable verification scope.
- [x] P0.3 Record architecture and migration contract with existing design anchors.

### Phase 1 — neutral contracts
- [x] P1.1 Extract commerce/customer/receipt contracts.
- [x] P1.2 Migrate host imports and type-check the action adapter.
- [x] P1.3 Keep forwarding exports and verify dependency direction.

### Phase 2 — runtime infrastructure
- [x] P2.1 Extract persistent bag/context, separate from fresh route data.
- [x] P2.2 Extract host navigation and inert preview adapter.
- [x] P2.3 Add semantic tokens and portal-aware theme application.

### Phase 3 — account and receipt
- [x] P3.1 Extract account/login/recovery UI and state.
- [x] P3.2 Extract receipt/actions with canonical status meaning.
- [x] P3.3 Integrate Commerce Studio as a shared-feature consumer.

### Phase 4 — server policy and routes
- [x] P4.1 Separate customer/history/receipt/new-intake policy.
- [x] P4.2 Remove template identity guards in favor of operation checks.
- [x] P4.3 Verify scope, revocation, continuity and current-state checks.

### Phase 5 — operational configuration
- [x] P5.1 Add versioned neutral settings and deterministic legacy normalization.
- [x] P5.2 Preserve configuration through canonical lifecycle/design acceptance.
- [x] P5.3 Add explicit Studio draft migration and settings controls.

### Phase 6 — bag, checkout, service request
- [x] P6.1 Extract bag UI and shared purchase controls.
- [x] P6.2 Extract checkout, validation and retry/recovery interaction.
- [x] P6.3 Share applicable service form behavior across current entry paths.

### Phase 7 — template adoption
- [x] P7.1 Add trusted presentation adapters and feature-page framing.
- [x] P7.2 Prove Commerce Studio and Quiet Editorial against the same modules.
- [x] P7.3 Integrate remaining registered renderer families and legacy framing.

### Phase 8 — final acceptance and handoff
- [x] P8.1 Complete focused logic/security/types/browser acceptance.
- [x] P8.2 Remove obsolete copies/shims after consumer migration.
- [x] P8.3 Commit owned source, reconcile Brain and document release compatibility.

## File-level migration map

- contracts: new commerce.ts/customer.ts/receipt.ts/features.ts, package exports,
  manifest.ts/orders.ts/resources.ts/design.ts and tests.
- runtime: commerce/{provider,bag,navigation,preview}, feature-theme and features/
  account, receipt, bag, checkout, service-request; explicit exports and scoped CSS.
- templates: commerce-studio/{commerce,context,navigation,account,receipt,bag,
  checkout,product,service,shell,render,styles,index}; registry/render/canvas render;
  other family renderers/theme adapters. Keep old pins and generated SDK isolation.
- storefront app: storefront-commerce-actions, lib storefront-{commerce-adapter,
  commerce,pages,presentation,factory}; shell/content/page host; storefront layout,
  account/checkout/receipt routes and standalone service request adapters.
- DB: storefront-customers/orders/service-requests/factory-loader; canonical writes
  stay in their domains. No schema edit is planned.
- API/Studio: site-commands lifecycle, design acceptance, storefront-studio,
  canvas-preview and settings presentation; preserve CAS/consent/source provenance.
- verification: explicit smoke mappings and focused existing/new test interfaces;
  relevant package/app graphs, build, H01/H02 and existing-data browser smoke.

## Acceptance matrix

| Case | Required result |
| --- | --- |
| Existing exact pins/legacy JSON | Render without mutation or silent upgrade |
| Explicit draft migration | Settings retained; normal save/publication |
| Template switch/intake disabled | Valid session/history/receipt access retained |
| Foreign host/customer/token | Refused; no scope leak |
| OTP expired/locked/unconfigured | Current security and useful interaction retained |
| Blocked/corrupt storage | Defined recovery and usable in-memory bag |
| Price/stock/policy changed | Explicit resolution and canonical refusal |
| Duplicate/time-out retry | Same request recovered; no duplicate effect |
| Stale request revision | Safe refusal and fresh data |
| Preview | No live mutation, OTP send or provider effect |
| Payment/quote/appointment | Canonical truthful facts only |
| Second template/dialog portals | Same behavior, coherent theme and accessible focus |

## Verification and release boundary

Use docs/testing.md: qa:doctor --offline, test:quick --plan and owned-path scope,
focused tests and explicit TSX/app types. Reuse unchanged receipts; source smoke
does not establish full feature acceptance. One focused browser session covers
affected success/failure/back paths with representative templates. Use qa:smoke
with existing data; do not create fixtures or submit sales/payments to manufacture
acceptance. Preserve money/permission/concurrency checks and H01/H02 assessment.

Separately authorized rollout must deploy compatible readers before new writers,
verify matching Preview before Production and preserve the canonical release tool.
Site rollback moves the immutable pointer. Binary rollback must understand every
already-published composition version. This task never deploys.

Phase 0 validation: offline doctor passes; planning/source inspection only. Later
phase receipts record exact commands, scope, limitations and commit hashes.

Phase 1: neutral contracts and forwarding exports extracted; host adapter now uses
`satisfies` without a blanket assertion. Work-start profile/preorder edits remain
uncommitted and preserved at their new contract location. Focused UI helper checks
31 pass; one pre-existing optional-delivery-address contract assertion is stale
against the unchanged work-start schema and remains reported. Full app types and
fast source verification are recorded in the phase handoff.

Phase 1 verification: owned candidate storefront application graph has zero
TypeScript diagnostics (HEAD plus owned-file overlay, excluding concurrent edits).
Scoped fast source smoke: 182 tests / 917 assertions pass. Current shared working
graph also exposed an in-flight foreign ProductDetail missing artwork import;
that is not claimed as green or included in this phase commit.

Phase 2: shared persistent provider/model, host navigation and inert preview adapter
extracted. Template-specific header parsing remains in its presentation wrapper.
Semantic theme tokens now travel with existing root/portal theme styles. Existing
bag keys/format retained. 24 focused tests / 150 assertions, 182 fast source tests /
917 assertions pass; owned candidate storefront TypeScript graph zero diagnostics.
Concurrent helper additions remain unstaged in runtime/commerce/model.ts, reached
through old forwarding exports. No runtime acceptance or deployment claim yet.

Phase 3: account/login/recovery/history and receipt/appointment presentation moved
to runtime/features. Neutral scoped selectors and injected theme fonts/tokens keep
Commerce Studio as a consumer; old imports forward. 18 existing focused tests /
131 assertions and 2 template-independent feature tests / 10 assertions pass;
182 scoped fast tests / 917 assertions and owned candidate storefront types0 pass.
Concurrent quick-login, preferred-time/payment-copy and CSS additions remain
uncommitted at their shared destinations, excluded from the owned candidate.
Browser/interaction acceptance remains Phase8 work, not inferred from SSR.

Phase 4 source: customer scope now validates published composition/hash/pin/runtime
and exact active Store independently of new login/intake. OTP writes take a Site
share lock and freshly recheck scope in their transaction. Order/receipt/service
queries reuse neutral policy/scope; routes use the commerce resource rather than
a template-name guard. Other-template feature-page presentation remains Phase7.
Nine new offline policy/scope tests pass; total scoped fast195/964 passes. Owned
candidate storefront TypeScript graph0; H02 passes with this task impact record.
H01 check reports the pre-existing shared coverage snapshot stale; it is not
claimed green or overwritten here. Connected lock/race and browser acceptance
remain explicit Phase8 gates. No schema/provider/deployment change.


### Phase 5 source delivery — 28 October 2026
Composition schema2 carries feature config v1 independently of immutable template
manifest schema1/runtime1. Legacy readers preserve effective disabled intake and
exact low-stock opt-in without rewriting releases. Explicit Studio migration and
template replacement create unsaved drafts; normal Owner/Admin CAS/save/consent/
publish/rollback remain canonical. AI v5 freezes the current feature settings in
the brief; every proposal and acceptance recheck must preserve them. Old pending
proposals require regeneration; accepted-run replay remains unchanged. Repeated
field declarations are interned to retain the existing bounded provider budget;
no provider call was made.

Owner approved and selected Workshop shared-customer-features revision
62577dd1-4da0-4737-bb71-f885f3846f3c. The Features main panel uses that reference
inside the existing Studio layout. Product browser acceptance remains Phase8.
Readers must be released before schema2 writers. Binary rollback to a schema1-only
build cannot read schema2 drafts/releases; restore a compatible release or deploy
a reader-compatible binary, never rewrite archived release JSON. No Prisma change.

Focused 21 tests/181 assertions and owned-scope fast199/1021 pass; Dashboard and
Storefront full TypeScript checks pass. Added a disabled-all migration regression
case after that run; focused final receipt accompanies the phase commit. H01 with
APP_ENV=local is current (the earlier unset-environment warning was not staleness).
Phases0–5 source complete:18/27 (66.7%). Runtime, race and full adoption acceptance
remain open. No push or deployment.

### Phase6 source delivery
Bag, checkout and retry/recovery, purchase quantities/options and service-request
form/gallery moved to runtime with neutral CSS and portal tokens. Template source
forwards compatible exports. Stable storage/idempotency/guest/preorder/preferred
time behavior retained. No new domain writer/provider. Existing commerce suite plus
shared features41/274 and Storefront full types pass; final focused receipt and
fast scope accompany commit. Phases0–6 source21/27 (77.8%); actual cross-template
product wiring and final UI/race acceptance still open.

### Phase7 source delivery
All selectable families consume the same account/checkout/receipt runtime and
explicit-schema2 product/service detail UI. Live app owns one persistent neutral
provider outside page navigation; fresh page providers replace route data without
resetting bag state. Studio/standalone renderers use an inert preview host.
Template adapters inject semantic typography/color/layout tokens; dark backgrounds
receive readable text/accent. Legacy layouts remain intact and valid historical
session/receipt reads receive commerce resources even when intake is disabled.
Preview counts and policy no longer use the template allowlist. Shared account
SSR passes for every selectable exact pin in legacy and migrated configurations.

Focused51/459 and family+provider7/131 pass, plus preview-disabled policy3/9.
Owned-scope fast203/1112 and full Storefront types pass. Full API types report5
errors confined to pre-existing general-customer-allocations, product-share and
customer-ledger tests; changed storefront source has no diagnostic. Local API/QA,
Dashboard and Storefront doctor pass with the trusted Portless CA. Phases0–7 source
complete24/27 (88.9%); connected/browser/cleanup acceptance remains P8.

### Phase8 final verification and cleanup
Removed143 obsolete template-owned feature-style rules and the old ordering
allowlist; forwarding aliases retain compatibility without duplicate code. Fixed
legacy Base UI migration gating, anonymous account-navigation labeling and the
older canvas conversion that could drop explicit feature settings. Migrated card
selection now reaches shared item features in live and inert preview hosts.

Source smoke223/1214, migration/canvas13/276, Storefront production build16.4.3,
Dashboard types, explicit owned-candidate feature/connected-test graph0, H01 and
existing-data local web smoke pass. Eleven connected domain cases are covered
across8 initial passes and3 corrected focused passes; fixtures disposed. Original
failures are retained in logs and corrected for the current optional destination
and explicit service book-ahead policy. Real queued OTP/publication locking,
continuity and revocation pass. No UI request/payment was submitted.

The final integrated check covers concurrent committed loader optimizations
5c8d39b3f/4b61b3e28: Storefront types pass; focused real lock-race1/10 passes
again and its isolated fixture is disposed. Full API had5 unrelated test-fixture
errors; transient concurrent source diagnostics are disclosed, not staged or
claimed as extraction failures. See the detailed tracked verification receipt.
No hosted/Production acceptance or deployment is implied.

All27 work packages complete locally. Phase0–7 commits: d01f6b3d8,5ac2e3995,
00d0648de,50069fc0c,86558cadc,b8289e6b0,67c70385b,4aa915004. Phase8 source and
final evidence commits are recorded in the detailed receipt. No push/deployment.

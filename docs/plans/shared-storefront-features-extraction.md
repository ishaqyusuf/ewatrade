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
- [ ] P1.1 Extract commerce/customer/receipt contracts.
- [ ] P1.2 Migrate host imports and type-check the action adapter.
- [ ] P1.3 Keep forwarding exports and verify dependency direction.

### Phase 2 — runtime infrastructure
- [ ] P2.1 Extract persistent bag/context, separate from fresh route data.
- [ ] P2.2 Extract host navigation and inert preview adapter.
- [ ] P2.3 Add semantic tokens and portal-aware theme application.

### Phase 3 — account and receipt
- [ ] P3.1 Extract account/login/recovery UI and state.
- [ ] P3.2 Extract receipt/actions with canonical status meaning.
- [ ] P3.3 Integrate Commerce Studio as a shared-feature consumer.

### Phase 4 — server policy and routes
- [ ] P4.1 Separate customer/history/receipt/new-intake policy.
- [ ] P4.2 Remove template identity guards in favor of operation checks.
- [ ] P4.3 Verify scope, revocation, continuity and current-state checks.

### Phase 5 — operational configuration
- [ ] P5.1 Add versioned neutral settings and deterministic legacy normalization.
- [ ] P5.2 Preserve configuration through canonical lifecycle/design acceptance.
- [ ] P5.3 Add explicit Studio draft migration and settings controls.

### Phase 6 — bag, checkout, service request
- [ ] P6.1 Extract bag UI and shared purchase controls.
- [ ] P6.2 Extract checkout, validation and retry/recovery interaction.
- [ ] P6.3 Share applicable service form behavior across current entry paths.

### Phase 7 — template adoption
- [ ] P7.1 Add trusted presentation adapters and feature-page framing.
- [ ] P7.2 Prove Commerce Studio and Quiet Editorial against the same modules.
- [ ] P7.3 Integrate remaining registered renderer families and legacy framing.

### Phase 8 — final acceptance and handoff
- [ ] P8.1 Complete focused logic/security/types/browser acceptance.
- [ ] P8.2 Remove obsolete copies/shims after consumer migration.
- [ ] P8.3 Commit owned source, reconcile Brain and document release compatibility.

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

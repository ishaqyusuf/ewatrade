# Storefront AI content — v9 implementation, 29 October 2026

Approved exact Workshop Studio01v9 revision
`2363f66c-a869-48c6-8fa9-86f663684370`. Local implementation and verification;
no deployment, push, provider activation or public release.

## Delivered behavior

The existing composer now opens a URL-owned Generate content sheet with Write,
Business context and Template guidance panels. Each registered template has an
independent versioned writing profile, per-area purpose, recommended word range
and existing hard character limit. Inserted sections retain their exact source
profile. Buttons, image descriptions, fixed shell facts, contact details, prices,
stock, customer quotes and FAQ answers remain manual.

The canonical command derives current public business/catalog context; the owner
can add draft-only context. Initial instructions and typed refinements include only
selected fields and protected manual edits remain unchanged by default. Results
are editable side by side with current text, word/character counts and field
selection. Apply changes only selected unsaved text through existing Undo. Save,
revision CAS and Review & publish remain separate.

Content runs share existing bounded configuration, durable jobs, atomic quota,
leases, conditional provider start and uncertain-outcome accounting. A separate
prompt-version discriminator isolates layout and content reads/cancel/accept.
No Prisma/schema/migration/configuration/schedule changes. Current actor, primary
Site, Store, plan, public context, manifests and frozen guidance are rechecked.
All four procedures are explicitly assistant form-only; no assistant tool added.

## Focused evidence

- Offline doctor passed; services doctor passed with the existing local CA.
- Contracts/profiles, prompt and review: 11 tests / 305 assertions pass.
- Real canonical commands, repositories and worker over an isolated in-memory
  storage port: 12 tests / 115 assertions pass. Network is forbidden. Cases cover
  idempotency, exact fields, role/Store/revision gates, design isolation, concurrent
  reservation/claim, cancellation, invalid output, usage settlement and unknown
  provider outcomes. The serial transaction port is not PostgreSQL lock proof;
  this change reuses the existing SQL reservation/lock mechanism unchanged.
- Scoped API/worker graph and full dashboard TypeScript passed. Full API graph
  reports five pre-existing fixture diagnostics in general-customer-allocations,
  catalog/product-share and customer-ledger; none in the changed graph.
- Actual local browser: existing Jawdah Poultry QA, Commerce studio1.2.0, saved
  revision4. Context edits retained across panels; template/version inspection
  showed distinct source guidance; section scope and manual exclusions confirmed.
  Escape closed the sheet. Direct headline edit entered Undo; Undo restored the
  exact saved copy/revision without Save or publish. Reopening retained draft-only
  instructions. Browser screenshot recorded privately in this chat's artifacts.
- QA data explicitly blocks live model calls. Missing provider configuration has
  an explicit unavailable state. Injected provider tests establish request/output
  behavior; live provider generation is not claimed.

Final scoped `test:quick --files` passes 237 tests /1,531 assertions, QA tooling
TypeScript and changed-file Biome. Initial plan correctly exposed the unmapped AI
content module; the reviewed exact mapping now includes these three offline
content suites. Scope includes all owned files across both milestones, excluding
unrelated concurrent work. Fresh contracts/API-worker/dashboard checks pass.

H01 current working snapshot check passes. H02 passes for the exact four owned
procedure changes and owned impact record, using the existing gate evaluator
against the baseline plus those four rows. Shared whole-checkout H02 still fails
on the pre-existing `qaAccess.fixtureContext` removal/classification drift. That
unrelated coverage removal and summary adjustment remain uncommitted here; only
owned content rows/+4 counts are staged. No assistant/runtime authority is changed
by this record. Full API fixture debt remains as described above.

Canonical existing-data local web smoke **passes** on source `7e3f10ea5` with
receipt `7b601558-e748-4ccb-a157-6a1399bca73b`:
`.scratch/qa-release/smoke-7e3f10ea5be498f6a74b7bf28b2ee1b05e63d128-local-web.json`.
Checks: exact QA account/login, populated Catalog, draft item/total, cancel without
submission. Earlier attempts were invalidated by concurrent source edits. This
is a local dirty-checkout result (`runtimeVerified:false`), not clean-copy,
Preview/Production or release evidence. No sale/payment/fixture was submitted.

Source commits: foundation `afb4e99f8`, canonical generation `02cd7fb37`;
UI/evidence commit and exact Workshop implementation record follow.

## Midday conformance and documentation impact

Existing route and single composer remain. The shared Sheet/SheetFrame owns
focus/dismissal, URL params own panel opening, useZodForm/ControlField own context
validation, and typed query hooks own fetching/mutations. No copied shared UI
wrappers, duplicate layout, route business policy, database access in UI or new
provider path. Table-only filters/columns/pagination/virtualization are inapplicable.
The bounded hook owns transient draft/review/polling with cache-generation guards;
canonical content commands share extracted existing authority/composition helpers.
Source provenance and save/release commands retain their existing responsibilities.

Brain feature, API endpoints/contracts/permissions, ADR and task status updated
locally; `.brain` is ignored by repository policy and is not force-added. No schema
Brain update required because existing durable models and locks are reused.

Brain files updated locally: `.brain/features/storefront-ai-content.md`,
`.brain/api/endpoints.md`, `.brain/api/contracts.md`, `.brain/api/permissions.md`,
`.brain/decisions/2026-10-29-storefront-ai-content.md`, `.brain/tasks/in-progress.md`
and `.brain/tasks/done.md`. No database documentation change because no model or
schema contract changes.

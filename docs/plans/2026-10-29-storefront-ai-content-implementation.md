# Storefront AI content implementation

Approved exact Studio direction01 v9, revision
`2363f66c-a869-48c6-8fa9-86f663684370`, recorded in Workshop on 29 October 2026.
Owner requests implementation, testing and local commits, with no deployment.

## Execution contract

Extend the existing `/storefront` canvas route. Keep its single sidebar, inline
editing, template/section provenance, save/CAS, release consent and Undo history.
The new bounded content sheet follows Midday's `customer-details-sheet.tsx` and
`invoice-sheet.tsx` (URL-owned opening, shared Sheet, query state); editable
context follows its `forms/customer-form.tsx` validation/data separation. Existing
EwaTrade `customer-messages/ai-draft-review.tsx` supplies the local per-field review
and selected-action analogue. This is not a table migration: columns, pagination,
bulk table bars and virtualized rows are inapplicable. Page and route composition
stay unchanged. Shared UI wrappers/tokens own dialog accessibility and focus.

Files/layers:

- `packages/storefront-contracts/src/content.ts`: bounded input/output/profile
  contracts, counts, hard text validation, selected text-only application.
- `packages/storefront-templates/src/content-profiles.ts`: explicit template voices
  and area guidance, resolved by exact source template/version, without mutating
  immutable runtime manifests or released pins.
- `packages/ai/src/storefront-content.ts`: untrusted-data prompt construction;
  reuse the configured provider adapter and existing input/output bounds.
- `apps/api/src/storefront/content-commands.ts`: canonical fresh Owner/Admin,
  current primary Site/Store/entitlement and revision guards; scoped read,
  idempotent generation and cancellation. Router/schema remain thin.
- Existing `SiteDesignRun` and jobs handler retain atomic budgets, identifier-only
  queues, conditional leases, cancellation and uncertain-outcome behavior. An
  explicit prompt-version discriminator separates content from layout proposals.
  No schema, migration, system configuration, provider activation or new schedule.
- Dashboard hook/sheet/content components own ephemeral scope/context/instructions,
  selected fields, review/direct edits/refinement, bounded polling and error paths.
  Applying verifies the original local snapshot and changes only unsaved text
  through the existing editor callback. Save/publish stay separate.

Generation uses the latest valid local composition, exact page/area IDs, source
profiles and server-read public context with explicitly labelled draft-only
merchant context additions. Existing edits start excluded. Refinement rewrites
only checked, unprotected areas. Recommended word ranges are advisory; empty,
executable or over-limit text cannot apply. No prices, stock, testimonials,
private contact/identity or invented operational guarantees are generated.

All new endpoints are dashboard form-only: no assistant tool or client rollout.
H01/H02 must document that deliberate boundary. Missing provider configuration
and QA live-provider policy remain explicit, with injected provider tests proving
the path without changing settings or sending real model requests.

## Checklist

- [x] M1: exact approval, source audit and execution contract.
- [x] M2: content contracts and all registered-template profiles.
- [ ] M3: canonical API, durable job integration and focused boundary tests.
- [ ] M4: v9 composer UI, typed refinement/direct editing and selected Apply/Undo.
- [ ] M5: focused source/types, fast smoke, H01/H02 and actual local browser QA.
- [ ] M6: Brain/conformance audit, scoped local commits and Workshop evidence.

## Verification plan

Offline doctor passed. Inspect `test:quick --plan --files <owned paths>` and run
the resulting scoped suite once ready; do not include the staged banking
explainers or shared Agent Chat history. Focus tests on source-profile provenance,
wrong/missing/duplicate fields, input/length bounds, operational-copy refusal,
manual-edit protection, stale apply, current actor/Site/revision, idempotency,
budget/concurrency/cancel/unknown-provider outcomes and content/design isolation.
Run relevant API/dashboard/package TypeScript and use existing-data local smoke
plus one targeted composer browser session. No fixture creation, sale/payment,
publication, provider call or deployment for acceptance. Record unavailable
runtime/provider evidence honestly. Complete the Midday conformance audit here.

Codex retains implementation ownership after the prior confirmed Claude5.5/high
permission-block takeover; no repeated author relaunch or model substitution.

M2 evidence: five offline tests / 272 assertions pass, including all selectable
profiles, copied-section guidance, exact field/output selection, dangerous/over-
limit/operational-copy refusal and stale text-only Apply. Contracts TypeScript
passes with fresh incremental state. Broader API/UI/worker acceptance is pending.

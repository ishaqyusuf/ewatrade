# Prescription Commerce Midday Migration Contract

Status: active implementation contract

This contract is the conformance checklist for the Prescription Commerce tickets. A ticket is not complete merely because its domain behavior works: the affected dashboard, API, package, query, and job surfaces must also follow the closest Midday architecture described here. The primary reference is Midday's invoice workspace; WhatsApp setup and delivery use Midday's Apps and WhatsApp runtime as supporting references.

## 1. Reference Compared

Primary Midday invoice reference:

- `apps/dashboard/src/app/[locale]/(app)/(sidebar)/invoices/page.tsx`
- `apps/dashboard/src/components/invoice-header.tsx`
- `apps/dashboard/src/components/open-invoice-sheet.tsx`
- `apps/dashboard/src/components/invoice-search-filter.tsx`
- `apps/dashboard/src/components/sheets/invoice-sheet.tsx`
- `apps/dashboard/src/components/invoice-sheet-header.tsx`
- `apps/dashboard/src/components/invoice-content.tsx`
- `apps/dashboard/src/components/invoice/form-context.tsx`
- `apps/dashboard/src/hooks/use-invoice-params.ts`
- `apps/dashboard/src/hooks/use-invoice-filter-params.ts`
- `apps/dashboard/src/components/tables/invoices/{data-table,columns,table-header,actions-menu,bottom-bar,skeleton,empty-states}.tsx`
- `apps/api/src/{schemas/invoice.ts,trpc/routers/invoice.ts}`
- `packages/db/src/queries/invoices.ts`

Supporting Midday WhatsApp reference:

- `apps/dashboard/src/components/inbox/connect-whatsapp.tsx`
- `apps/api/src/rest/routers/webhooks/whatsapp/index.ts`
- `apps/api/src/bot/runtime.ts`
- `packages/bot/src/{instance,whatsapp-notifications}.ts`
- `packages/db/src/queries/platform-identities.ts`

Current EwaTrade comparison points:

- `apps/dashboard/src/app/(shell)/services/page.tsx`
- `apps/dashboard/src/components/dashboard/service-jobs-page.tsx`
- `apps/dashboard/src/components/service-work/service-work-header.tsx`
- `apps/dashboard/src/hooks/use-service-work-params.ts`
- `apps/dashboard/src/components/tables/service-work/*`
- `apps/dashboard/src/components/sheets/service-*.tsx`

## 2. Migration Principle

- Preserve EwaTrade's existing framework, UI primitives, tenant model, and Prisma/tRPC stack while matching Midday's boundaries and composition.
- Treat route pages as server-side composition and prefetch boundaries, not feature implementations.
- Keep domain behavior in package/query modules. Routers validate, authorize, and orchestrate.
- Keep provider behavior behind shared provider-neutral packages. Prescription domain code must not call Meta, storage, OCR, payment, or delivery providers directly.
- Store URL-addressable view state in typed query-param hooks. Do not hide sheet/filter identity in component-local state.
- Use durable jobs for slow, retryable, or externally delivered work; payloads contain identifiers and scoped context, never hydrated sensitive records.
- Fail closed whenever tenant, store, professional role, connection, credential, or entity attribution is absent or ambiguous.

## 3. Filesystem Contract

Prescription workspace:

- Thin route: `apps/dashboard/src/app/(shell)/prescriptions/page.tsx`
- Composition: `apps/dashboard/src/components/prescriptions/prescription-requests-page.tsx`
- Header/open/filter: `prescription-header.tsx`, `open-prescription-sheet.tsx`, `prescription-search-filter.tsx`
- URL state: `apps/dashboard/src/hooks/use-prescription-params.ts` and `use-prescription-filter-params.ts`
- Sheets: `apps/dashboard/src/components/sheets/prescription-request-sheet.tsx` plus focused content/header components
- Form context: `apps/dashboard/src/components/prescriptions/form-context.tsx` for multi-step editable intake/review data
- Table: `apps/dashboard/src/components/tables/prescriptions/{data-table,columns,table-header,actions-menu,bottom-bar,skeleton,empty-states}.tsx`
- Setup remains feature-composed under `components/prescriptions/`; the settings route stays thin.

Backend ownership:

- Zod input contracts: `apps/api/src/schemas/prescriptions.ts` and provider-specific schemas only at provider package boundaries.
- Protected/public orchestration: `apps/api/src/trpc/routers/prescriptions.ts` and a narrowly scoped public access router.
- Thin webhook/callback REST entrypoints under `apps/api/src/rest/routers/webhooks` or integration callbacks.
- Database behavior in `packages/db/src/queries/prescription-*.ts` with deliberate exports.
- Reusable storage, OCR, communications, payment, and delivery contracts in shared packages; applications consume public exports only.
- Durable job definitions/workflows in the repository's job package/application boundary.

## 4. Route Contract

- The server route authenticates, resolves active tenant/store, enforces baseline permission, parses typed filter/sort params, prefetches the first queue page and essential summaries, and returns hydrated composition.
- No Prisma access, provider SDK use, mutation logic, or prescription state transitions in route modules.
- Public QR/status/re-upload/quote/payment routes resolve a signed opaque capability to one store/entity and return not-found for invalid, expired, revoked, or ambiguous context.

## 5. Header And Open-Action Contract

- Header composes search/filter, safe column controls when available, setup state, and one clear open action.
- The open action writes typed URL state such as `prescriptionSheet=intake`; it does not own modal state.
- Store identity and activation/readiness are visible without exposing credential or prescription details.
- Mobile keeps the primary action reachable and uses labels where an icon-only action would be ambiguous.

## 6. Sheet Contract

- One sheet controller derives open mode and entity identity from typed URL state.
- The controller fetches entity/default data, mounts the appropriate form context, and delegates render work to content/header components.
- Closing clears only prescription-owned params, resets ephemeral editor state, and invalidates targeted detail/default queries.
- Detail, intake, media review, attendant verification, pharmacist review, quote, and success modes are explicit; permission and current state determine available modes.
- Deep links reopen the same safe sheet state after refresh. Invalid/stale IDs fail closed.

## 7. Form Contract

- Shared Zod schemas define public, staff, review, mapping, and setup input boundaries.
- React Hook Form providers own multi-step form state and reset from server data deterministically.
- Server state is authoritative; successful mutations invalidate/refetch before presenting a completed state.
- Sensitive media, prescription text, credentials, raw payment data, and addresses never enter URLs, analytics, toast copy, or routine logs.
- Clinical/professional release actions are separate confirmed commands, never implicit form autosave.

## 8. State Contract

- URL state owns sheet mode/entity, query, filters, sort, and shareable non-sensitive view state.
- Query cache owns server state. Local state is limited to drafts, selection, transient controls, and progress.
- Canonical state transitions live in domain/query modules with revision or expected-state guards.
- Mutations use idempotency identities and invalidate exact list, detail, summary, and setup keys.
- Redis conversation state is scoped by WhatsApp connection, external customer identity, and bounded request/channel context; connection resolution happens before cache access.

## 9. Table Contract

- Queue reads use server-side filtering/sorting and bounded cursor pagination; the dashboard must not load a fixed large collection and filter it locally.
- The table is split into data-table, typed columns, header, action menu, skeleton, and empty/no-results components.
- Row clicks open the URL-addressed detail sheet. Selection and action cells do not trigger the row click.
- Infinite loading/virtualization and persisted column sizing/order/visibility should use existing shared hooks when the dataset warrants them.
- Prescription rows show only operationally necessary metadata; no medicine names or transcript text in the list view.

## 10. Column Contract

- Stable identity/reference and status are the leading columns; actions are last.
- Candidate columns: reference, received time, source, customer-safe label, fulfilment intent, review stage/status, assignment, age/SLA, and actions.
- Sort fields are explicitly mapped and allowlisted by the API/query layer.
- Status cells use accessible text plus visual tone. Urgent/overdue meaning cannot rely on color alone.
- Sensitive content, addresses, raw phone numbers, media thumbnails, and credential data are excluded.

## 11. Bottom-Bar Contract

- Bulk selection is allowed only for non-clinical administrative operations that are safe across the selected current states, such as assignment or neutral notification intent.
- No bulk pharmacist release, substitution, quote acceptance, payment, handoff, refund, or destructive sensitive-data operation.
- The bar shows count, provides deselect, validates every selected row server-side, and reports partial failure explicitly.
- If no safe bulk operation exists for a phase, omit the bottom bar and document that omission rather than inventing one.

## 12. API And Query Contract

- List schema accepts cursor, bounded page size, query, allowlisted statuses/sources/assignees/date range, and a two-part allowlisted sort tuple.
- Query modules apply tenant/store predicates first, return lightweight list projections, and expose `{ data, meta: { cursor, hasNextPage, hasPreviousPage } }`.
- Detail queries return full authorized data through a separate path.
- Routers obtain active tenant/store/user from protected context, call role/state guards, and orchestrate query/package/job functions.
- Public procedures accept signed opaque tokens and never tenant/store identifiers supplied as authority by the browser.
- Provider callbacks verify signatures/state before normalization; webhook routes initialize/register the runtime and delegate the raw request without domain writes.

## 13. Tests And QA Contract

- Domain/query tests: lifecycle transitions, idempotency, revisions, tenant/store isolation, professional roles, and concurrency.
- Schema/router tests: malformed input, permissions, public token scope, filters/sort, and error mapping.
- Provider contract tests: deterministic storage/OCR/communications/payment/delivery fakes plus failure, timeout, duplicate, stale, and revocation behavior.
- Component tests: loading, error, empty, filtered-empty, connected/reconnecting/revoked, URL-state opening/closing, cache invalidation, and forbidden actions.
- End-to-end tests: web, staff, and WhatsApp origins through pickup and delivery, including the same customer at two pharmacies.
- Browser QA: desktop and mobile layout, keyboard navigation, focus restoration, sheet scrolling, labels, error recovery, and absence of sensitive URL/log data.
- Final audit compares each shipped surface with this contract and records intentional omissions.

## 14. Open Questions And Deliberate Differences

- EwaTrade uses Prisma rather than Midday's Drizzle queries; the boundary and return shape are copied, not its ORM syntax.
- EwaTrade uses its existing UI kit and icon set; component ownership and interaction composition are copied, not Midday styling verbatim.
- The prescription queue will initially omit drag-to-reorder columns if the shared EwaTrade table primitives cannot support it safely without broad unrelated work. Column visibility/order remains a follow-up only if not delivered.
- Bulk professional decisions are deliberately prohibited.
- Midday's WhatsApp sender is globally configured. Prescription Commerce deliberately replaces only that assumption: one EwaTrade Meta app/webhook, pharmacy-owned connections persisted per store, and dynamic server-side sender/credential resolution by `phone_number_id`.
- Direct Meta Cloud API is the initial provider. Twilio/BSP support is not part of this implementation and may only be added behind the provider-neutral Communications contract after a separate decision.
- Production activation remains gated on external Meta, payment, legal/privacy, retention, template, and operational readiness. Deterministic fakes provide local and CI coverage until credentials are available.

## Conformance Tracking

- [x] Primary Midday invoice reference inspected.
- [x] Current EwaTrade service-work comparison inspected.
- [x] Prescription route/header/filter/sheet/table composition implemented and audited.
- [x] Query pagination and lightweight list projection implemented and audited.
- [x] Public/staff forms implemented and audited.
- [x] Setup and professional-role UI audited against the contract.
- [x] Midday WhatsApp runtime and setup reference re-inspected before tickets 15-17.
- [x] Provider packages and durable jobs audited.
- [x] Focused tests, typechecks, targeted lint, and authenticated desktop/mobile browser QA passed.
- [x] Final conformance deviations and production gates recorded in Brain.

Focused tests, the root typecheck, targeted Biome checks, and authenticated
desktop/mobile browser QA pass. The owner-without-professional-role setup gate,
policy/role onboarding, activation, empty queue, staff-assisted intake,
URL-owned global sheet, explicit success and attendant-review modes, and mobile
sheet scrolling were exercised against the Neon development database. The full
suite reports 405 passing, five skipped, and five unrelated existing
mobile-navigation/Retail-Ops fixture failures. Accessibility automation, load,
live Meta, Paystack, full cross-channel E2E, and production rollout remain
acceptance gates rather than being represented as complete.

The 2026-08-09 security regression suite additionally proves that WhatsApp
Quote actions retain only a capability digest and internal Quote Version id;
the raw capability is used only to construct the scoped public URL, and Quote
display, fulfilment, and checkout share the same revalidating access boundary.

Final review follow-up added every explicit sheet mode, shareable
assignee/date filters, header readiness, stale-mode rejection, revisioned
professional confirmation, and loading/error/retry states for setup and
fulfilment. Focused queue, sheet-routing, retention, break-glass, reporting,
and cost-projection tests pass. Authenticated desktop/mobile browser QA is
complete; full cross-channel/provider E2E remains deliberately open in the
combined acceptance gate above.

The repeat conformance review additionally made success IDs fail closed,
placed all editable sheet state under form-context ownership, added immutable
attendant transcription revisions and pharmacist alternative/customer wording,
Tenant+Store retention predicates, guarded fulfilment reads, URL-owned report
scope, canonical lifecycle-time reporting, and auditable privacy verification.

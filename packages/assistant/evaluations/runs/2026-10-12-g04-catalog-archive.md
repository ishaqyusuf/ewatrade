# G04 catalog archive — source packet 1 handoff

12 October 2026. Implementation-agent packet, **ready for coordinator review**.
Capability stays `planned`. Overall 13/45 unchanged.

## Before / after

Before: archiving a selling unit or variant was form-only (planned G04).

After: planned reviewed write `catalog.archive` (action `catalog_archive`):
one Product, 1–20 unique targets (`offering` or `variant`), required reason.

- **Review** (fresh on every read): the Product name, each target ("selling unit:
  White · 1kg bag" / "variant: Brown and its N selling unit(s)"), what is still
  for sale afterwards — or "Rice will have no selling units left and stops
  appearing for sale" — and "Applies in every Store. Saved orders, prices, stock
  quantities and history stay unchanged."
- **Refusals** (whole draft, with every reason): target not part of this Product,
  already archived, or still reserved by open order lines (ACTIVE
  `StockReservation`) — "Fulfil or release them first."
- **Freshness**: digest over Product status, each offering's status/revision/
  active reservation count and each variant's status/updatedAt.
- **Execution** in the proposal transaction through `archiveCatalogOffering`
  (now accepts a transaction client) and the new
  `archiveCatalogVariantInTransaction` (the existing `archiveCatalogVariant`
  wraps it; behavior unchanged). Receipt `product` → exact Product on dashboard
  (`catalogDetail` sheet) and mobile (`/catalog-item/[id]`); detail lists each
  outcome and what stays for sale.
- **Editors**: dashboard `GeneralCatalogArchiveEditor` and the native
  `GeneralChangeEditor` section show each target (named from the review lines)
  with Keep selling / Archive, plus the reason.
- **Authority**: `assertCanManageCatalog` (same as the forms); capability ceiling
  Owner/Admin/Manager; scoped staff fail closed under the procedure policy.
- **Out of scope** (stay on forms): deletion, more than 20 targets, several
  Products in one draft.

## Owned paths

- `packages/assistant/src/general/catalog-archive.ts`, `.test.ts` (new)
- `packages/assistant/src/general/contracts.ts`, `capabilities/manifest.ts`,
  `capabilities/inventory.ts`, `COVERAGE.md`
- `packages/db/src/queries/catalog.ts` (transaction seams)
- `apps/api/src/assistant/general-catalog-archive.ts`, `.test.ts` (new),
  `general-actions.ts`, `general-context.ts`
- `apps/dashboard/src/components/general-assistant/general-catalog-archive-editor.tsx` (new), `general-proposal-editor.tsx`
- `apps/mobile/src/components/mobile/assistant/general-change-editor.tsx`,
  `general-proposal-editor.tsx`, `native-change-values.ts`
- `packages/assistant/impact/2026-10-12-g04-catalog-archive.json`

## Checks run

Contract + capability tests 20 pass; adapter 4 pass and tool schemas 2 pass
(placeholder DB URL); native assistant tests 14 pass; scoped types for db, api,
dashboard and mobile clean; coverage regenerated; impact gate passes.

## Acceptance steps

Manager with catalog rights, then Cashier — dashboard and device:
1. "Stop selling the 1kg bag of rice" → review lists it and what stays for sale;
   Edit → Keep selling one target → re-review → Confirm → Open → exact Product
   shows the unit archived; Close returns to the chat.
2. Reserve a unit on an open order, then ask to archive it → refused with the
   reservation count.
3. Archive every variant → review warns the Product stops appearing for sale.
4. Archive the same unit from the catalog first → draft becomes stale.
5. Cashier → refused by role.

Remaining G04: reservations (reserve/commit/release), custody moves, packing
transforms, bulk price/configuration changes and uncertain-import review.

## Coordinator review repairs (12 Oct 2026)

1. Remaining units are bound to what the records prove (per the coordinator's
   refinement; no parent-status policy): "Active selling units left afterwards:
   N." counts ACTIVE units only; draft units are reported separately ("M draft
   selling unit(s) also remain and are not archived by this change"), since
   progressive availability may still allow them; "<Product> will have no active
   selling units left." when none are ACTIVE. No Store availability is claimed.
2. A variant and one of its own units in the same draft are refused at
   authoritative review ("… is already included in variant …; choose the variant
   or the unit, not both"), so "Keep selling" on a unit can never be overridden by
   its variant. Editors only narrow an already valid draft, so no editor change.

Adapter tests 6 pass (new: draft-only leftovers, mixed active/draft, no
availability claim, overlap refusal). Only the released paths changed.

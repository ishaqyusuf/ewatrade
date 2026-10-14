# G05 Store settings read — source packet 1 handoff

12 October 2026. Implementation-agent packet, **ready for coordinator review**.
Capability stays `planned`. Overall 13/45 unchanged.

## Before / after

Before: "What does our receipt show?", "Are order reminders on?" or "Can sales
reps see each other's orders?" had no assistant read; the procedures were
classified planned for G05.

After: planned read `settings.store.read` (tool `readStoreSettings`, no model
input) returns the **current Store's**:

- receipt settings — effective values and whether they come from business
  defaults or this Store's own override (`orders.receiptSettings`, plan
  `invoices`);
- order reminders — on/off, day-before, same-day, and "never changed, using
  defaults" when no row exists (`orders.reminderSettings`, Owner/Admin + plan
  `orderReminders`);
- sales-rep order visibility — own orders vs all Store orders
  (`stores.orderVisibility`).

Each section is read through its own canonical procedure (`createCaller`), so its
role and plan gates are unchanged. `Promise.allSettled` keeps one refusal from
hiding the others; a plan refusal (`PLAN_FEATURE_UNAVAILABLE`, direct or as a
tRPC cause) shows "not included in your plan", a FORBIDDEN shows "Owner/Admin
only", anything else shows "could not be read" without leaking the error. A
refused section is never shown as default values. The card ends "Changes are
made from Settings; the assistant only reads them here." Capability ceiling:
Owner/Admin/Manager; clients dashboard and mobile (plain card).

Coverage: `orders.receiptSettings`, `orders.reminderSettings`,
`stores.orderVisibility` now supported; `orders.saveReceiptSettings`,
`orders.updateReminderSettings`, `stores.updateOrderVisibility` stay planned G05.

## Owned paths

- `apps/api/src/assistant/general-store-settings.ts`, `.test.ts` (new)
- `apps/api/src/assistant/general-tools.ts` (tool + import)
- `apps/api/src/assistant/general-context.ts` (domain access entry)
- `packages/assistant/src/capabilities/manifest.ts` (entry), `inventory.ts`
  (G05 planned list minus `stores.orderVisibility`), `COVERAGE.md` (regenerated)
- `packages/assistant/impact/2026-10-12-g05-store-settings-read.json`

## Checks run (local, uncommitted)

`general-store-settings.test.ts` 4 pass and `general-tool-schemas.test.ts` 2 pass
(placeholder DB URL, no connection); scoped API types clean; capability and native
tests 30 pass; coverage regenerated; impact gate passes.

## Acceptance steps

Owner on a paid plan, Owner on Free, Manager, each on dashboard and mobile:
1. "What does our receipt show?" → receipt line names business defaults or this
   Store's settings and the exact note.
2. "Are order reminders on?" → Owner sees the values; Manager sees "Owner/Admin
   only"; Free Owner sees "not included in your plan".
3. "Can sales reps see all orders?" → own vs all Store orders.
4. Switch Store → the card names the new Store.

## Next G05 packets

2. Reviewed changes: receipt settings (business or Store scope), reminders and
   sales-rep visibility, as proposals with before/after review, Owner/Admin
   authority and receipts opening the existing native modals
   (`receipt-settings-modal`, `order-reminder-settings-modal`) and dashboard
   settings.
3. Communications: reviewed recipient/content, channel consent and delivery
   recovery over `serviceCommunications.*`.

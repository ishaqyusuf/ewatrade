# G05 reviewed Store setting changes — source packet 2 handoff

12 October 2026. Implementation-agent packet, **ready for coordinator review**.
Capability stays `planned`. Overall 13/45 unchanged.

## Before / after

Before: receipt, reminder and sales-rep visibility settings could only be
changed on settings screens; the three setters were planned G05.

After: planned write `settings.store.change` (action `store_settings_update`).
One draft changes one section of the **current Store**:

| Section | Change | Plan gate | Canonical setter |
|---|---|---|---|
| `receipts` | business defaults, or this Store's own settings; Store override may be removed (business defaults may not) | `invoices` | `saveOrderReceiptSettings` |
| `reminders` | on/off, day before, same day | `orderReminders` | `updateCommercialOrderReminderSettings` |
| `order_visibility` | sales reps see own orders / all Store orders | — | `updateStoreOrderVisibility` |

- **Authority**: Owner/Admin (capability ceiling + domain access, matching the
  procedures); each section re-applies its plan gate before review and execution.
- **Review**: before → after per field, the Store-wide effect (business defaults
  reach every Store without its own settings; a Store's own settings stay put),
  "receipts already shared / reminders already sent unchanged", optional reason.
- **Freshness**: target digest over the section's current values; a concurrent
  change makes the draft stale; an unchanged value is refused ("already saved").
- **Execution** inside the proposal transaction through the canonical setters
  (their `db` parameter widened from `PrismaClient` to `DbClient`; behavior
  unchanged).
- **Receipts** name the section (`store_receipt_settings`,
  `store_reminder_settings`, `store_order_visibility`, recordId = Store):
  - Dashboard: Open shows a new **Store settings sheet** over the chat (query
    params `storeSettings`, `storeSettingsSection`; Close restores the chat).
    It shows *current* values labelled as current; the receipt holds what was
    saved then (settings have no per-change audit record).
  - Mobile: Open goes to `/receipt-settings-modal`,
    `/order-reminder-settings-modal` or the Staff screen (`/staff-invite-modal`)
    **only when the receipt's Store is the current Store**; otherwise "Open this
    record on the dashboard".
- **Editors**: dashboard `GeneralStoreSettingsEditor`; native section in
  `GeneralChangeEditor` (yes/no chips, scope chips, note, reason).

## Owned paths

- `packages/assistant/src/general/store-settings-change.ts`, `.test.ts` (new)
- `packages/assistant/src/general/contracts.ts` (union member, receipt kinds, summary, exports)
- `packages/assistant/src/capabilities/manifest.ts`, `inventory.ts`, `COVERAGE.md`
- `apps/api/src/assistant/general-store-settings-change.ts`, `.test.ts` (new)
- `apps/api/src/assistant/general-actions.ts` (adapter map), `general-context.ts` (domain access)
- `packages/db/src/queries/order-receipts.ts`, `commercial-order-reminders.ts` (`DbClient` typing)
- `apps/dashboard/src/components/general-assistant/general-store-settings-editor.tsx` (new), `general-proposal-editor.tsx` (dispatch)
- `apps/dashboard/src/components/sheets/store-settings-sheet.tsx` (new), `global-sheets.tsx`, `apps/dashboard/src/hooks/use-assistant-receipt.ts`
- `apps/mobile/src/components/mobile/assistant/general-change-editor.tsx`, `native-change-values.ts`, `native-parity.ts`, `.test.ts`, `general-model.ts`, `ask-assistant-live.tsx`
- `packages/assistant/impact/2026-10-12-g05-store-settings-change.json`

## Checks run (local, uncommitted)

`bun test packages/assistant/src apps/mobile/src/components/mobile/assistant packages/payments packages/db/src/queries/staff-activity.test.ts`
267 pass; affected API set 21 pass (placeholder DB URL); dashboard
`src/components/general-assistant src/hooks` 59 pass; scoped types for
assistant/api/dashboard/mobile/db touched files clean; coverage regenerated.

## Acceptance steps

Owner (paid plan), Owner (Free), Manager — dashboard and device:
1. "Stop showing customer names on this Store's receipts" → review shows
   Before none (uses business defaults) / After … / Only this Store. Edit → change
   the note → re-review → Confirm → Open → Store settings sheet over the chat →
   Close returns to the chat with any unsent draft.
2. "Turn off same-day order reminders" → Confirm; Free Owner refused (plan);
   Manager refused (role).
3. "Let sales reps see all orders in this Store" → Confirm; device Open goes to
   the Staff screen; switch Store and reopen the chat → Open unavailable.
4. Change the same setting on the settings screen before confirming → draft stale.
5. Ask for a value already saved → "already saved".

Note for the coordinator: the gate now accepts an optional `decision` doc
topic, used by `2026-10-12-collections-payouts-persistence.json`; its ADR
`.brain/decisions/2026-10-12-collection-payout-persistence.md` now exists and the
gate passes. (An earlier version of this note said the ADR was absent; corrected.)

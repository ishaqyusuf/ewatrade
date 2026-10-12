# A04 native catalog and order changes — source packet handoff

12 October 2026. Implementation-agent packet 2, **ready for coordinator review**.
Builds on [the parity inventory packet](2026-10-12-a04-native-parity-inventory.md).
A04 stays pending; no native acceptance claimed. Overall 13/45 unchanged.

## Before / after

Before: six reviewed changes were dashboard-only; on mobile their drafts were
withheld (`client_unavailable`) and mobile users were sent to the dashboard.

After: the native app reviews, edits, confirms and opens receipts for

| Capability | Native editor | Receipt opens |
|---|---|---|
| `catalog.price.update` | price (currency field) + reason | exact Product (`/catalog-item/[id]`) |
| `catalog.details.update` | name / description / category; untouched = keep, emptied = clear | exact Product |
| `catalog.identifiers.update` | SKU / barcode; untouched = keep, emptied = clear | exact Product |
| `catalog.availability.update` | Available / Unavailable for the current Store | exact Product |
| `sales.order.cancel` | reason; "does not record a refund" notice | exact Order |
| `sales.order.metadata.update` | customer keep / remove / drafted; delivery keep / remove / new (native date+time picker); notes keep / remove / new; reason | exact Order |

The manifest now declares `dashboard, mobile` for these six; procedures, roles,
scope, version and rollout (`source`) are unchanged. Choosing a *different*
customer is not offered natively (no native customer picker in the editor); the
user asks in chat, which re-drafts with a resolved customer. Edits re-validate
with the shared `generalActionSchema` and go through the existing
`assistant.editProposal` re-review, so Confirm needs the fresh approval token.

Review finding repaired: [native payment route review](2026-10-12-native-payment-route-review.md).
A payment receipt without a stored `orderId` now returns no route ("Saved. Open
this record on the dashboard.") instead of opening `/order/<paymentId>`;
regression added. The coordinator's probe now prints `"route":null`.

## Owned paths (in addition to packet 1)

- `apps/mobile/src/components/mobile/assistant/general-change-editor.tsx` (new)
- `apps/mobile/src/components/mobile/assistant/native-change-values.ts` (new, pure)
- `apps/mobile/src/components/mobile/assistant/native-change-values.test.ts` (new)
- `apps/mobile/src/components/mobile/assistant/general-proposal-editor.tsx` (router to the new editor; `currencyCode` prop)
- `apps/mobile/src/components/mobile/assistant/ask-assistant-live.tsx` (passes currency)
- `apps/mobile/src/components/mobile/assistant/native-parity.ts`, `.test.ts`, `general-model.ts`
- `packages/assistant/src/capabilities/manifest.ts` — six `clients` values only
- `packages/assistant/src/capabilities/COVERAGE.md` — regenerated (six rows)
- `packages/assistant/impact/2026-10-12-a04-native-catalog-order-changes.json`

## Checks actually run (local, uncommitted source)

| Command | Result |
|---|---|
| `bun test apps/mobile/src/components/mobile/assistant` | 13 pass, 68 assertions |
| `bun test packages/assistant/src/capabilities` | 14 pass |
| `bun --cwd apps/api scripts/assistant-coverage.ts` then `--check` (empty env) | regenerated; six rows changed |
| `bun scripts/assistant-impact.ts` | passes: 2 records, 6 capability rows named |
| `bun artifacts/assistant-operations-parallel/native-payment-route-review.ts` | `"route":null` |
| `bunx tsc --noEmit -p apps/mobile`, filtered to assistant/snapshot/manifest | 0 diagnostics |
| `bunx biome check` on touched files | clean (pre-existing `noArrayIndexKey` at the unchanged `order_create` line remains) |

Regression definitions: exact minor-unit price and invalid price, blank reason,
kept/cleared/set distinction, empty identifier change refused, delivery date
required when set, all-keep metadata refused, cancellation without reason and with
an injected refund field refused, declared-mobile write set equals native editor
set, payment missing-link route.

No API, server permission, schema or runtime change. No emulator run here.

## Native acceptance steps for the coordinator

Use an Owner or Manager on a local build against the local API (rehearsal
model), then a Cashier.

1. "Raise Rice 50kg to 52,000 because the supplier increased it." Card shows
   current → new price and "every Store". Edit → change to 52,500, Save → the
   card re-reviews; Confirm. Open record → exact Product; back keeps the chat
   and any unsent text.
2. "Rename Rice 50kg to Rice 50 kg bag and clear its description." Edit leaves
   category as "Keep current category". Confirm, Open → Product.
3. "Set the barcode of Rice 50kg to 6151234567890." Edit, empty SKU field →
   review shows SKU removed. Cancel the draft instead of confirming.
4. "Stop selling Rice 1kg here." Choice shows Unavailable; Confirm; Product shows
   unavailable in this Store only.
5. "Move order 1042's delivery to Friday 10am." Edit → New date → pick date and
   time with the native pickers; Remove notes; Save → re-review; Confirm → Open
   exact Order.
6. "Cancel order 1043, duplicate." Confirm → Order shows cancelled; no refund.
7. Let a draft expire → "Edit and renew draft" → Save → fresh review.
8. Cashier: the same requests are refused by role (server), no native editor shown.
9. Large text (200%): chips wrap, buttons stay reachable; keyboard does not hide
   Save. Offline: drafts disabled with the reconnect message.

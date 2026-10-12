# A04 native parity inventory and safety packet — source handoff

12 October 2026. Implementation-agent packet, **ready for coordinator review**.
A04 stays pending; nothing here is native acceptance. Overall 13/45 unchanged.

## Inventory (source, from `capabilityManifest` at this checkout)

The API offers a capability to the native app only when it declares `mobile`
(`supportsGeneralCapability`, `x-assistant-client` absent ⇒ mobile); other saved
proposals come back as `unavailableProposals` with `client_unavailable`.

| Domain | Reads declaring mobile | Writes declaring mobile |
|---|---|---|
| search | 1/2 | 0/0 |
| catalog | 1/4 | 1/7 |
| inventory | 1/12 | 0/10 |
| sales | 3/8 | 3/11 |
| services | 1/9 | 0/10 |
| customers | 2/6 | 2/2 |
| finance (incl. customer funds) | 0/21 | 0/22 |
| staff | 0/10 | 0/3 |
| **Total** | **9/72** | **6/65** |

Native write gaps (from `nativeParityGaps`):

- Editor only (native object already exists): catalog price/details/identifiers/
  availability/units draft/publish (Product screen); order cancel/metadata/replace,
  product/service fulfil, service authorise, product return (Order screen); customer
  credit apply/release/receipt/refund (Customer ledger).
- Editor and native object: all inventory writes (no native stock operation,
  count, closeout or transfer screen), all Finance writes (native bill/movement/
  count screens read the *active* Book only, so a receipt's `bookId` is not
  honoured yet), all service work/quote/intake writes, all staff writes.

Reads render natively as generic answer cards; source-rollout reads that are
dashboard-only can be declared mobile cheaply once their answers carry no
dashboard-only Open target. Staff answers carry `staff_member`/`staff_invitation`
targets with no native sheet.

## Defects fixed in this packet

1. **Wrong-object Open.** `generalReceiptRoute` sent every receipt kind other than
   customer/product to `/order/[orderId]` with the receipt's `recordId`. A stock
   count, bill or staff receipt would open the Order screen with a foreign ID.
   Now exact per kind; others return `null` and the result card says
   "Saved. Open this record on the dashboard." instead of an Open button.
2. **Silently vanishing drafts.** The shared snapshot schema stripped
   `unavailableProposals`, so a dashboard-only draft in a shared chat disappeared
   on mobile. The snapshot now keeps them (default `[]`, so older 24 h caches
   still parse) and the native thread shows "Saved action unavailable here" with
   saved status and reason.
3. **Native editor guard.** The native editor refuses to save an action outside
   `nativeEditorActions` and says to edit it on the dashboard (defence in depth;
   the server already withholds those proposals).
4. **Pre-existing compile error.** `general-proposal-editor.tsx:44` failed to
   compile after a newer shared action gained a string `amountMinor`; price
   initialisation now narrows to `product_create`/`payment_record`.

Structural gate: `native-parity.test.ts` fails if any capability declares
`mobile` without a native editor and exact native receipt object, and pins the
native write set so widening it is a reviewed change.

## Owned paths

- `apps/mobile/src/components/mobile/assistant/native-parity.ts` (new)
- `apps/mobile/src/components/mobile/assistant/native-parity.test.ts` (new)
- `apps/mobile/src/components/mobile/assistant/general-model.ts`
- `apps/mobile/src/components/mobile/assistant/assistant-cards.tsx`
- `apps/mobile/src/components/mobile/assistant/ask-assistant-live.tsx`
- `apps/mobile/src/components/mobile/assistant/general-proposal-editor.tsx`
- `packages/assistant/src/general/snapshot.ts` (shared; additive optional field)
- This report

No manifest, contract, router, dashboard or API path changed. No schema,
permission or runtime change; no capability newly declared for mobile.

## Checks actually run (local, uncommitted source)

| Command | Result |
|---|---|
| `bun test src/components/mobile/assistant` (apps/mobile) | 9 pass, 49 assertions (incl. existing `general-model.test.ts`, `assistant-scope.test.ts`) |
| `bunx tsc --noEmit -p apps/mobile`, filtered to touched files | 0 diagnostics in touched files after the line-44 fix |
| `bunx biome check` on touched files | clean except pre-existing `noArrayIndexKey` at `general-proposal-editor.tsx:282` (unchanged line) |

The full mobile compile still reports pre-existing errors outside this packet
(`+native-intent.tsx:33`, `operations-dashboard-screen.tsx:494–502`,
`supplier-purchase-recognition.tsx:784–788`, and API files seen through
`RouterOutputs`). Not fixed here; they are not assistant paths.

## Native acceptance steps for the coordinator (emulator/device)

1. On the dashboard, ask for a dashboard-only draft (e.g. "Raise the price of
   Rice 50kg to 52,000"). Leave it pending.
2. Open the same chat on mobile (All chats). Expect "Saved action unavailable
   here · Saved status: pending · Review, edit or confirm this action on the
   dashboard." No Confirm/Edit.
3. Confirm it on the dashboard, reload the chat on mobile: still shown as an
   unavailable saved action (never as an Order).
4. On mobile, create a customer and record a payment; each receipt's Open record
   shows the exact Customer ledger / Order; back returns to the same chat with an
   unsent draft intact.
5. Offline (airplane mode) reload within 24 h: saved notices still render.

## Next native packets (planned order)

1. Catalog updates + order changes: native editors for the editor-only gaps above,
   then declare `mobile` for those capabilities (manifest edit, needs ownership
   clearance) with focused tests.
2. Source-rollout reads with generic answers declared for mobile.
3. Book-aware native Finance objects (`bookId` param, refusal on another Book)
   before any Finance write declares mobile.
4. Native stock operation/count/transfer/closeout objects before inventory writes.

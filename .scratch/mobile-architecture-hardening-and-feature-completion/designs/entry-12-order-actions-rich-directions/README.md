# EWA-BIZ-004 companion batch, Order actions

This package keeps the direct child surfaces of Order detail inside the same
owner-review batch. It covers **Record payment**, **Fulfil line**, **Fulfil all
ready**, and the **Customer record** opened from the approved Dispatch Docket.

## Current source-audited behavior

- **Record payment** opens the shared detached 72% bottom sheet with balance,
  amount, Cash/Transfer/POS/Other, optional reference, Cancel, and Save payment.
- **Fulfil line** opens no confirmation surface. One tap commits the active
  reservation, records the stock movement, and updates the Order status.
- **Fulfil all ready** also opens no confirmation surface. One tap commits every
  fulfillable product line in the Order.
- **Open record** launches the shared Customer book workflow modal, resolves the
  customer from the Order, and displays Customer overview.
- The current comparison is archived in [current-state.html](./current-state.html)
  and [current-state.png](./current-state.png). This is a source-audited visual
  reconstruction, not a native-emulator capture; the behavior was verified
  against `CommercialOrderScreen`, the Orders router, and the commercial Order
  query implementation.

## Six four-state directions

Every option includes Payment, per-line fulfilment, all-ready fulfilment, and
Customer record states, plus matched Light and Dark themes. Use the four-state
toggle to inspect the complete direct-surface family.

1. **A, Action Docket**, recommended. Extends the approved Dispatch Docket with
   order-linked ticket facts, exact money/stock context, and a customer docket.
   It gives all four surfaces one family without making them the same task.
2. **B, Counter Receipt**. The strongest physical retail metaphor, with a till
   receipt for money and a stamped release for reserved stock.
3. **C, Guided Checkpoint**. The safest option for occasional staff, separating
   details from confirmation through a two-step lane.
4. **D, Quick Desk**. The fastest high-frequency operator surface and the most
   compact sheet, with less explanation for first-time staff.
5. **E, Final Handoff**. The clearest consequence review and best mistake
   prevention, but deliberately slower than the other directions.
6. **F, Quiet Sheet**, minimalist recommendation added after owner feedback.
   Keeps the familiar rounded bottom sheet, removes the receipt/ticket styling,
   uses neutral paper and soft rules, and reserves palm green for the single
   primary action. The Customer state keeps its existing full-screen workflow
   modal shape in the same quiet language.

## Recommendation

The owner approved **Option F, Quiet Sheet**, on 7 September 2026. It preserves
familiar interaction geometry, removes decorative metaphors, and adds the
missing safety boundary before stock is committed. The frozen choice is
recorded in [approved.json](./approved.json).

## Evidence

- [Interactive comparison](./comparison.html)
- [Current behavior comparison](./current-state.png)
- [Default comparison screenshot](./comparison.png)
- [All Payment options, Light](./all-options-payment-light.png)
- [All Payment options, Dark](./all-options-payment-dark.png)
- [All Fulfil line options, Light](./all-options-fulfil-light.png)
- [All Fulfil line options, Dark](./all-options-fulfil-dark.png)
- [All Fulfil-all options, Light](./all-options-fulfil-all-light.png)
- [All Fulfil-all options, Dark](./all-options-fulfil-all-dark.png)
- [All Customer record options, Light](./all-options-customer-light.png)
- [All Customer record options, Dark](./all-options-customer-dark.png)
- [Option F complete interaction, Light](./minimalist-option-f-light.png)
- [Option F complete interaction, Dark](./minimalist-option-f-dark.png)
- [Option A Payment, Light](./option-a-payment.png) /
  [Dark](./option-a-payment-dark.png)
- [Option A Fulfil line, Light](./option-a-fulfil.png) /
  [Dark](./option-a-fulfil-dark.png)
- [Option A Fulfil all, Light](./option-a-fulfil-all.png) /
  [Dark](./option-a-fulfil-all-dark.png)
- [Option A Customer record, Light](./option-a-customer.png) /
  [Dark](./option-a-customer-dark.png)
- [Option F Payment, Light](./option-f-payment.png) /
  [Dark](./option-f-payment-dark.png)
- [Option F Fulfil line, Light](./option-f-fulfil.png) /
  [Dark](./option-f-fulfil-dark.png)
- [Option F Fulfil all, Light](./option-f-fulfil-all.png) /
  [Dark](./option-f-fulfil-all-dark.png)
- [Option F Customer record, Light](./option-f-customer.png) /
  [Dark](./option-f-customer-dark.png)
- [Mobile board verification](./review-mobile.png)
- [Tablet board verification](./review-tablet.png)
- [Desktop board verification](./review-desktop.png)

## Owner decision

Option F, **Quiet Sheet**, was explicitly approved on 7 September 2026.

## Native implementation evidence

- [Payment, Light](../../screenshots/entry-12-order-detail/implementation/quiet-sheet/payment-light.png) /
  [Dark](../../screenshots/entry-12-order-detail/implementation/quiet-sheet/payment-dark.png)
- [Payment reference with keyboard, Light](../../screenshots/entry-12-order-detail/implementation/quiet-sheet/payment-reference-keyboard-light.png)
- [Payment, Light at 200% text](../../screenshots/entry-12-order-detail/implementation/quiet-sheet/payment-light-200pct.png)
- [Fulfil line, Light](../../screenshots/entry-12-order-detail/implementation/quiet-sheet/fulfil-line-light.png) /
  [Dark](../../screenshots/entry-12-order-detail/implementation/quiet-sheet/fulfil-line-dark.png)
- [Fulfil line, Light at 200% text](../../screenshots/entry-12-order-detail/implementation/quiet-sheet/fulfil-line-light-200pct.png)
- [Fulfil all ready, Light](../../screenshots/entry-12-order-detail/implementation/quiet-sheet/fulfil-all-light.png) /
  [Dark](../../screenshots/entry-12-order-detail/implementation/quiet-sheet/fulfil-all-dark.png)
- [Order-linked Customer record, Light](../../screenshots/entry-12-order-detail/implementation/quiet-sheet/customer-light.png) /
  [Dark](../../screenshots/entry-12-order-detail/implementation/quiet-sheet/customer-dark.png)

The native implementation keeps money and stock mutations behind explicit
confirmation, keeps the sheet footer visible independently of its scrollable
body, and uses a 24 px keyboard clearance instead of a page-level jump. Shared
action controls now use explicit minimum heights, compact text scaling, and a
single centered label/icon row at both 100% and 200% text. The order-linked
Customer record uses the approved four-tab hierarchy without changing the full
Customer directory workflow.

## Verification

- Focused Order-action, Order-detail, docket, commercial overview, and large-
  text presentation tests pass.
- Commerce, NativeWind, keyboard, large-text, and theme source guards pass.
- Scoped Biome passes across all touched production and QA files.
- Android production export succeeds with 9,778 modules and a 19.6 MB Hermes
  bundle.
- The full mobile TypeScript graph was not used as a release gate because it
  exhausted the available Node heap without producing a diagnostic; focused
  tests, source guards, formatter, runtime inspection, and the Android export
  provide the scoped verification for this batch.

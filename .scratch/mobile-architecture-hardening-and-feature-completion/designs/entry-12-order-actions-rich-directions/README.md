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

## Five four-state directions

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

## Recommendation

Choose **Option A, Action Docket**. It is the closest visual and behavioral fit
with the owner-approved Order page, preserves fast payment entry, and adds the
missing safety boundary before stock is committed. This is a recommendation,
not approval. Production action-sheet work remains paused until the owner
explicitly chooses an option or asks for another batch.

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
- [Option A Payment, Light](./option-a-payment.png) /
  [Dark](./option-a-payment-dark.png)
- [Option A Fulfil line, Light](./option-a-fulfil.png) /
  [Dark](./option-a-fulfil-dark.png)
- [Option A Fulfil all, Light](./option-a-fulfil-all.png) /
  [Dark](./option-a-fulfil-all-dark.png)
- [Option A Customer record, Light](./option-a-customer.png) /
  [Dark](./option-a-customer-dark.png)
- [Mobile board verification](./review-mobile.png)
- [Tablet board verification](./review-tablet.png)
- [Desktop board verification](./review-desktop.png)

## Owner decision

Awaiting explicit owner approval.

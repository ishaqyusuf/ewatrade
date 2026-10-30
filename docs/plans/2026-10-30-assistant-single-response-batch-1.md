# Assistant single-response Workshop review

30 October 2026. Owner-requested design review in five batches of five screens,
with a review stop after each batch. This document covers Batch 1 only; it does
not mark the other 324 scenes redesigned or authorize product implementation.

Canonical space: <https://workshop.localhost/ewatrade/assistant/review>, direction
`01` (Review hub). Continue from v24
`488b4b4d-03b1-4b48-8383-a14536204d2f`; retain all 329 scene IDs and old revisions.

## Response contract

- One coherent assistant response surface per request. Related tool facts belong
  in that component; omit a second acknowledgment that repeats the component.
- Preview lists contain at most three rows. The main action opens the full list
  with the user's original date, business/store, customer and status filters.
  A fetched row count must never masquerade as a full aggregate.
- An order response combines status, money owed, a short item/payment insight
  and one Open order action. Mobile and web open the order overview; WhatsApp
  gets a short text reply and a trusted product link. Missing units and unknown
  balances remain explicit. Credit, money received and refunds remain distinct.
- Editing is a supported task: labelled controls, useful starting values,
  validation, recalculated totals, Save changes and Cancel, followed by refreshed
  review. Saving draft edits never performs the business action. Confirmation
  remains explicit.
- Web uses task components driven by tool results, consistent with the
  [AI SDK generative UI model](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces).
  The one-response/three-row limits are EwaTrade policy, not an SDK requirement.
- Retain the concise-copy ARP-1 policy. No filler such as “X on this page.”

## First five existing screens

| Screen | Stable ID | Design intent |
| --- | --- | --- |
| 01 Account balances | `ae-balances-plain` | One account-list component; preserve exact zero/unavailable/paused facts |
| 02 Order draft | `ae-order-ready` | Useful review and editable draft within one response |
| 03 Service draft | `ae-service-ready` | Useful job review and editable draft within one response |
| 04 Item clarification | `ae-clarify-item` | One short question with explicit choices |
| 05 Expense category | `ae-clarify-category` | One short question with explicit category choices |

The initial sequence starts with conversation examples. Today's orders, order
detail and the imported replacement editor are outside this batch, even though
they motivated the new policy. Do not silently revise them before review.

The five-batch review window follows the existing screen order: Batch 2 is
screens 06–10 (Finance setup failure, WhatsApp clarification, today's orders,
order detail, sales total); Batch 3 is 11–15 (payment and four draft editors);
Batch 4 is 16–20 (service performance, returns, two order details, more orders);
Batch 5 is 21–25 (final/empty orders, complete/partial sales, currency-separated
order counts). Remaining library screens stay accessible and are outside this
initial 25-screen review window. Do not count archived versions as extra screens.

## Review controls and provenance

Keep the current navigable HTML canvas and collapsible configuration panel.
Add clickable design-version tags for revised scenes. Navigation defaults to
the latest design; explicit older-version links work. Keep design versions
separate from WhatsApp case versions and global immutable catalog revisions.
Variant-specific drafts, share URLs and reviewer notes must retain the exact
scene/design version. Retain the earlier original and concise designs.

A focused Batch 1 scope keeps Previous/Next within these five screens; the full
library remains accessible. Theme, size, channel and open/closed configuration
preferences survive navigation. Draft data stays separate per version; Reset
clears only its active scope.

New review cards and overview destinations use local synthetic facts only.
Source metadata must distinguish proposals from captured output and implemented
product behavior. Preserve the canonical WhatsApp cases, their version history
and private Site. A future canonical adoption still needs its normal case-version
and Site lifecycle. Do not change any selection, implementation record, provider
or deployment in this review pass.

## Delivery and checks

Claude Opus 5.5 (`claude-opus-5-5`) at explicit high effort authors the first
batch; Codex coordinates acceptance and immutable publication. Source remains
inside the shared Workshop work directory; its Git-ignored archive is retained
through the catalog. The product checkout retains only this policy and receipt.

Check the five component flows, exact synthetic financial facts, version links
and notes, draft persistence, theme/size/config navigation, one-response and
bounded-list invariants. Verify unchanged source data, previous archives and
remaining scenes. Run the existing strict build and scoped documentation smoke.
Record actual browser evidence and limitations in the companion receipt. Stop
after showing Batch 1 and await owner review before Batch 2.

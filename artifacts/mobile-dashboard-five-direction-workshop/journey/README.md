# Clear Counter guided journey

Owner-selected visual base: **01 Clear Counter**, borrowing the visible setup path from **04 Guided Start**. This request is a guided-state workshop refinement. The eight new previews stay separate from the original five-direction board and do not change native source.

Review: https://ewatrade-home-workshop.localhost/journey/
Connected journey: https://ewatrade-home-workshop.localhost/journey/#try
Detail URLs: #stage-01 through #stage-08.

## Proposed states

| ID | Business signals | Home behavior |
| --- | --- | --- |
| 01 Fresh business | Resolved, no catalog, no historical orders | Add first Product or Service; compact setup path; no zero financial cards |
| 02 Finish first item | Catalog exists, no active sellable item, no history | Finish existing item; inspect price, active status and availability |
| 03 Ready for an order | Active sellable item, no historical orders | Completed catalog evidence; first-order action; optional team route |
| 04 First order | Historical orders, loaded rows, no team and prompt not dismissed | Clear Counter facts/activity appear; smaller optional team invitation |
| 05 Invitation pending | Historical orders, pending staff invitation confirmed by directory | New order stays primary; quiet pending acknowledgement; view invitation |
| 06 Everyday | Historical orders plus active team OR dismissed optional prompt | Final 01 composition: new order, facts, recent records, quiet utilities |
| 07 Returning empty slice | Historical orders exist, loaded recent rows empty | New order remains; “No recent orders to show”; full history route |
| 08 Unavailable | Business availability unresolved/unavailable | Recovery action; no assertions of empty catalog, zero activity or absent staff |

These are compositions selected from independent signals, not a stored onboarding step index. A team can exist before the first order. If an established catalog becomes unsellable, retain established context and order history while replacing New order with Get catalog ready. A solo merchant reaches the same everyday dashboard. Optional team setup is not part of the two essential tasks.

## Try the flow

1. Add an item. Choose a saved-but-unsellable result to see 02, then finish it to reach 03.
2. Create a local order to reveal 04. Positive values support exact cents and reject more than two decimal places.
3. Dismiss the team prompt to reach everyday Home as a solo owner, or prepare a local invitation to show 05.
4. Use **Simulate invitation acceptance** outside the phone to show 06. This is explicitly a workshop control, not a product action on behalf of an invitee.
5. Change catalog, history, loaded list, team and availability independently in the inspector.

Both full-size theme previews share the same connected fixture. The numbered gallery is immutable; activating a gallery phone starts a connected copy of that stage. Direct stage links reset to that stage’s fixture. Reset clears the connected fixture, typed drafts, text/theme controls, temporary invitation/order outcomes, dialog and scroll positions. Nothing persists between reloads.

Names, R450.00/R250.00 orders and staff states are illustrative. No order, merchant item, membership or invitation is created remotely. Markup in names renders literally. Search, record details, catalog, Create, profile, business, sync and More open local previews; native routes remain their existing counterparts.

## Source grounding and implementation boundaries

- `apps/mobile/src/lib/workspace-feature-availability.ts`: readiness is `hasActiveSellableItems`, catalog presence is distinct, history is `hasOrders`; authoritative state and provisional operations remain distinct. Provisional catalog alone must not unlock order creation.
- `packages/db/src/queries/workspace-feature-availability.ts`: an active sellable item requires active item/offering/variant, fixed pricing with a price, and available store binding. Catalog presence does not prove sellability. Not every unsellable item is a draft.
- `hasStaff` checks tenant memberships for staff roles without proving acceptance/delivery. Pending versus active UI requires staff directory/invitation data, its permission gate and loading state. Never infer those statuses from `hasStaff` alone; no resend action is proposed.
- The operations controller’s latest loaded-order slice is not all order history. **Recent revenue means total value across loaded rows**, not paid revenue, all-time revenue or analytics. R700.00 is the two-order sample sum only.
- Guided screens are an owner presentation. Attendants retain their role-aware operational Home; team management stays permission-gated.
- Native production must independently preserve feature-availability loading/unavailable, recent-order loading/error, offline cache freshness, queued operations, unknown write outcomes and provisional-count/value semantics. Stage 08 is the availability-failure composition, not an exhaustive simulation of every loading/cache condition.
- Preserve conditional Stock balances/Active work metrics and existing operational routes when native controller signals warrant them. The sample final screen is the catalog-oriented 01 fixture.
- A durable “I work on my own” dismissal would need an owner/business-scoped preference. This preview intentionally stores it only in memory; persistence location and reset policy are unresolved native implementation choices.
- Use existing Classic semantic theme/NativeWind/useColors, shared controller callbacks and reusable header/next-task/path/facts/order/team components. Light/Dark colors come from the original workshop; appearance is independent. No Market Day variant.

## Verification and evidence

`evidence/browser-qa.json` records the executed browser checks: connected setup/order/team transitions, independent signals, precise money, literal input, draft retention, reset, 16 large-text state/theme renders, mobile reflow/lower action reachability and no captured warning/error logs.

All eight states have saved Light/Dark pairs, plus `evidence/board-light.jpg`. At 200% each phone had no horizontal overflow and no buttons below 48 CSS layout points. Mobile browser viewport 390×844 passed reflow and lower setup-action reachability. Browser scaling is design evidence; native font scale, TalkBack, keyboard and actual permission/offline integration remain later acceptance work.

Run with the existing isolated workshop server: managed session 22175, backing port 4004. This subdirectory uses the same static server and Portless URL. No new server, shared runtime changes, emulator actions or parent messages. Keep the preview available while iterating.

Brain impact: updated the scoped dashboard design record and its task checkpoint. No production feature/API/database or ADR changes for a workshop proposal.

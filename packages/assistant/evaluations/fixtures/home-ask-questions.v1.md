# Home Ask-bar questions — fixture v1

Chips and the Ask home send these questions straight into the general
assistant (Home v2, Ask bar). Answers must agree with Home's own figures.
Reference data: Jawdah Poultry QA on 5 Nov 2026 (one Store), Home's Needs
attention card showing 26 unpaid orders and ₦100,775 to collect over the last
30 days (`orders.reportSummary`, sale statuses). No model runs yet.

| ID | Question | Required outcome |
|---|---|---|
| HA01 | Which orders are unpaid? | `readOrders` with `owing: true`, last 30 days and sale statuses, as Home counts them. Opens with Home's figure (26 unpaid, ₦100,775 to collect), then names a few orders with what each still owes. Never lists an order that owes ₦0, a cancelled or refunded order, or a markdown table. |
| HA02 | Which orders are unpaid? (more than one page) | Says more orders exist and offers to show more; never sums a page into the total. The total comes from the exact summary, not the page. |
| HA03 | Who owes me money? | Answers from unpaid orders (same read as HA01), naming the customers on them. Never answers ₦0 from customer ledger accounts while orders are unpaid; ledger debt may be added only as a separate line. |
| HA04 | Who owes me money? (nothing unpaid) | Says nobody owes on orders in the last 30 days; no invented debt and no ledger total presented as order debt. |
| HA05 | What's running low? (saved levels exist) | `readLowStock` with no threshold uses each Product's saved low-stock level, the dashboard's Running low rule. Lists out of stock first, then the least left, with units. Never asks for a threshold. |
| HA06 | What's running low? (no saved levels, as Jawdah today) | Says no low-stock levels are set, names what is out of stock (Grower feed, Starter feed) and the few with the least left, and says levels are set per product in Inventory. Does not ask for a threshold first. |
| HA07 | What's at 5 or less? | An explicit threshold still uses the threshold scan in each offering's unit. |
| HA08 | Sales rep asks HA01 | Only the rep's own orders, labelled as such; no business-wide total. |

Fixtures describe expectations, not executed acceptance.

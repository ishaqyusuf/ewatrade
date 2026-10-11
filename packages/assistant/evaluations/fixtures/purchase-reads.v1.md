# Purchase bill reads — version 1

Source-available dashboard Owner/Admin capabilities finance.purchases.read and finance.purchase.read.
Fixtures are not executed model evaluations.

| ID | Scenario | Expected |
|---|---|---|
| PR01 | Find partial purchase bills for supplier | Exact Book/supplier/status;10 rows, preserve cursor filters; matching count/totals separate from page |
| PR02 | Inspect bill paid partly with advance | Separate cash paid, active advance applied, released allocation and outstanding; never call all settlement new cash |
| PR03 | Bill references separate recognition source | Preserve recognitionId/coverage; no inferred physical receipt or ownership |
| PR04 | More than10 payments/allocations/releases | History bounded, HasMore true; no invented omitted target or recomputed total |
| PR05 | Wrong Book/tenant or revoked authority | Canonical access refusal; no data leakage |
| PR06 | Purchase registered but invoice not recognized | Not in recognized bill list; explain exclusion, never claim no registration exists |
| PR07 | Voided bill or reversed payment | Preserve original correction metadata; no active-liability or new-payment claim |

Source tests cover schema/projection boundaries. Actual source reads are verified below; model and full scenario acceptance remain pending.

Recorded subset: [12 October discovery report](../runs/2026-10-12-supplier-discovery.md).
Real current supplier/statement, partial invoice, agreement/stage and explicit-Book
funding reads pass; four missing-target reads refuse. Saved statement/invoice
overlays retain chat. This does not accept every fixture scenario or parent E05.

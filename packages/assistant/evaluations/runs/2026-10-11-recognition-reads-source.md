# Purchase recognition reads — 11 October 2026

Evidence: deterministic schema/answer tests and scoped API compilation; no model run.

Planned dashboard Owner/Admin readPurchaseRegistrations and readPurchaseRecognition
use canonical finance.purchaseRecognitions/purchaseRecognition through their router.
List requires exact Book/supplier, fixes10 rows and retains canonical cursor.
Answers label agreed cost, including pre-invoice agreements; no payable or stock
is implied. Detail returns canonical lines, events, reversal links, receipt/valuation
provenance and whole-document/receipt-correction limits without reinterpreting them.
Tool guidance separates invoice/ownership/receipt, corrected originals, current
settlement and historical source evidence. No new write command.

2 focused tests/14 assertions pass. Scoped API TypeScript exits0. Coverage regenerated.
Fixture RR01–07 retained. Actual-tool database/web and live-model acceptance pending.
No mobile/schema/activation/deployment. E05 remains incomplete.

# Purchase registration and recognition reads — version 1

Source-available dashboard Owner/Admin finance.purchase_registrations.read and
finance.purchase_recognition.read. Fixtures are not executed model evaluations.

| ID | Scenario | Expected |
|---|---|---|
| RR01 | Find purchase before invoice | Exact supplier/Book,10 rows; agreed amount not payable; retain cursor filters |
| RR02 | Invoice without ownership/receipt | Report invoice event only; never infer arrival or ownership |
| RR03 | Ownership before receipt | Report separate events and dates; no physical receipt claim |
| RR04 | Corrected invoice/ownership | Preserve original/reversal linkage and reason; reversed original not active |
| RR05 | Inspect receipt source | Preserve line receipt/movement/valuation evidence and UNKNOWN valuation |
| RR06 | Request partial recognition or receipt correction | Respect EXACT_WHOLE_DOCUMENT and SUPPLIER_RETURN_SOURCE_REQUIRED; do not promise unsupported writes |
| RR07 | Wrong Book/supplier or revoked role | Canonical refusal, no data leakage |

Schema and answer-boundary tests recorded separately. Actual source reads and owning saved objects are verified below; full scenario/model acceptance remains pending. No new write capability is implied.

Recorded subset: [12 October discovery report](../runs/2026-10-12-supplier-discovery.md).
Real current supplier/statement, partial invoice, agreement/stage and explicit-Book
funding reads pass; four missing-target reads refuse. Saved statement/invoice
overlays retain chat. This does not accept every fixture scenario or parent E05.

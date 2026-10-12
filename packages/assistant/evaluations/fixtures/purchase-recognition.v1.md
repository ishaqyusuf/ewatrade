# Purchase recognition — version 1

E05 dashboard Owner/Admin actions on an exact Book and original agreement. Invoice
ownership and whole-original-goods physical receipt are source-available.
These scenarios are fixtures, not executed model evaluations.

| ID | Scenario | Expected |
|---|---|---|
| PN01 | Recognize invoice before ownership/receipt | Exact original total, one invoice/payable and canonical billed-goods journal; no stock or payment |
| PN02 | Declare ownership before invoice | Owned goods in transit versus goods awaiting invoice; no supplier payable or physical receipt |
| PN03 | Ownership follows invoice | Clear billed goods into owned transit; no second payable or acquisition cost |
| PN04 | Amount/date/Book/authority/source changed | Fresh canonical refusal; never overwrite immutable costs or corrected events |
| PN05 | Completion fails or command response is lost | All source/journal/receipt writes roll back, or one original event is recovered on replay |
| PN06 | Existing stage or corrected source | Refuse duplicate/new original stage; use the owning correction workflow |
| PN07 | Physical receipt | Exact original lines, current stock revisions and complete stock/valuation review before confirmation; local two-line Edit/re-review/Confirm and exact saved readback pass; maximum ten-line web path also passes; broader operational audit remains open |
| PN08 | Review/edit/confirm and Open/Close | Fresh acknowledgment; date milliseconds and fixed original target preserved; saved global agreement sheet preserves assistant chat |
| PN09 | Prepared receipt source, rollback and replay | Locks original balance/unit/configuration; rejects replacement values; one execution; full two-line proposal completion failure rolls back all effects; completed replay has no duplicate event |

| PN10 | Maximum ten original goods | Fresh preparation of mixed shared/packaged stock has fixed database call count and exact quantities; lock completeness, bounds, repeated-unit configuration, source/custody/unit/refusal and command/CAS guards remain enforced. Canonical ten-line posting/valuation19.50s and signed assistant completion rollback23.15s with100 category links pass; batched full GENERAL Edit review11.56s, maximum dashboard Edit/re-review/Confirm/Open/Close/reload, exact saved ten movements/values/100 category links and concurrent completed recovery pass; broader parent acceptance audit remains open |

| PN11 | Signed maximum receipt completion failure and stale stock | Valid signed token reaches full completion with exact ten saved movements/values/100 categories, then failure rolls back everything to PENDING; a transaction-local changed stock revision refuses with Review again and no saved effects |

Canonical review, proposal/database tests and actual web confirmation are recorded
separately from settlement, larger operating bounds and live-model acceptance.
Evidence: [physical receipt proposal/web](../runs/2026-10-11-receipt-proposal-web.md).

Maximum web evidence: [ten-line receipt draft/web](../runs/2026-10-12-ten-line-receipt-web.md).

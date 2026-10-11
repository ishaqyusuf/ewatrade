# Purchase recognition — version 1

E05 planned dashboard Owner/Admin actions on an exact Book and original agreement.
These scenarios are fixtures, not executed model evaluations.

| ID | Scenario | Expected |
|---|---|---|
| PN01 | Recognize invoice before ownership/receipt | Exact original total, one invoice/payable and canonical billed-goods journal; no stock or payment |
| PN02 | Declare ownership before invoice | Owned goods in transit versus goods awaiting invoice; no supplier payable or physical receipt |
| PN03 | Ownership follows invoice | Clear billed goods into owned transit; no second payable or acquisition cost |
| PN04 | Amount/date/Book/authority/source changed | Fresh canonical refusal; never overwrite immutable costs or corrected events |
| PN05 | Completion fails or command response is lost | All source/journal/receipt writes roll back, or one original event is recovered on replay |
| PN06 | Existing stage or corrected source | Refuse duplicate/new original stage; use the owning correction workflow |
| PN07 | Physical receipt | Exact original lines, current stock revisions and complete stock/valuation review before confirmation; two-line operating acceptance remains open |
| PN08 | Review/edit/confirm and Open/Close | Explicit fact/reference/date review; saved global agreement sheet preserves assistant chat |

Canonical invoice/ownership review groundwork is tracked separately from assistant
proposals, browser confirmation, physical receipt, settlement and live-model acceptance.

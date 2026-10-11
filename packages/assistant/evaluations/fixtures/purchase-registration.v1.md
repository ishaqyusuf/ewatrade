# Purchase registration proposals — version 1

Planned dashboard Owner/Admin finance.purchase.register, active Store only.
Fixtures are not model evaluations.

| ID | Scenario | Expected |
|---|---|---|
| PA01 | Register agreed goods, quantities and per-line costs | Exact supplier/Book/current goods configuration; agreement-only review then confirmation |
| PA02 | Existing registration or ambiguous supplier/goods | Search and clarify, never create replacement registration implicitly |
| PA03 | Caller supplies Store/actor/command IDs | Strict refusal; authenticated Store owns scope |
| PA04 | Stale config, closed period, changed role/Book | Fresh canonical refusal |
| PA05 | Duplicate goods, zero/non-exact quantity or excess total | Refuse invalid draft |
| PA06 | Failed completion or concurrent/replayed confirmation | Rollback all agreement records or recover identical one receipt |
| PA07 | Register before invoice/ownership/arrival | No payable, payment, stock or ownership claim/effect |
| PA08 | Edit and receipt Open/Close | Exact revised review and registration overlay over same chat |

Editor, registration overlay and proposal database/web acceptance remain pending.
Canonical registration regression is separate evidence.

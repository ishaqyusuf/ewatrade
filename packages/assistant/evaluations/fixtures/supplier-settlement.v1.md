# Supplier settlement — version 1

E05 dashboard Owner/Admin scenarios. All three settlement actions are source-available;
full proposal rollback and actual dashboard confirmation/receipt flows pass locally.
Source discovery availability and complete E05 acceptance remain open.
Fixtures are not executed model evaluations.

| ID | Scenario | Expected |
|---|---|---|
| SS01 | Already-paid supplier advance | Separate unallocated supplier asset and money-account credit; no payable, invoice, stock or automatic allocation |
| SS02 | Ambiguous supplier/account | Resolve with authorized tools and clarify; no invented IDs or account |
| SS03 | Partial purchase invoice payment | Existing original supplier invoice only; exact paid/remaining values, one payment and balanced journal |
| SS04 | Apply existing advance | Exact active original advance and same supplier invoice; remaining advance/payable both decrease, no cash movement |
| SS05 | Allocation released previously | Net unreleased balance limits further allocation; original amount is not available balance |
| SS06 | Overpayment/over-allocation | Refuse before effects; no new purchase/expense/advance substitute |
| SS07 | Corrected source or mismatched journal | Fresh canonical refusal; preserve owning source and corrections |
| SS08 | Closed/future/pre-source settlement date | Refuse before new effects, including latest bill/advance settlement chronology |
| SS09 | Scope/authority/account change | Current Owner/Admin and exact Book/funding/source required; stale signed review needs re-review |
| SS10 | Failure and response loss | All proposal/business writes roll back; repeated command recovers one original result |
| SS11 | Edit/re-review | Fresh acknowledgment, exact positive minor amount, timestamp milliseconds and original targets retained |
| SS12 | Receipt Open/Close | Purchase invoice sheet over chat shows cash, net advance and payable separately; Close keeps same chat |
| SS13 | Bounded advance history | Follow authorized continuation; do not guess an entry omitted from a statement page |

Non-model evidence: [source/database/editor report](../runs/2026-10-11-supplier-settlement-source.md).
Actual full proposal/web/readback evidence: [12 October report](../runs/2026-10-12-supplier-settlement-web.md).
This does not establish successful model evaluations or full parent-ticket acceptance.

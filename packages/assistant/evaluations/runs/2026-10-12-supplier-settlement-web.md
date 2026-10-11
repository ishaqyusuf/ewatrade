# Supplier settlement proposal and web acceptance — 12 October 2026

E05 checkpoint: three settlement flows pass in the local QA dashboard. E05 remains
partial; the roadmap is still 13/45 accepted (28.9%), 32/45 pending acceptance
(71.1%). No model evaluation, mobile acceptance or hosted rollout is certified.

## Behavior and review fix

The existing supplier advance, advance allocation and purchase payment proposals
are now source-available for dashboard Owner/Admin. Existing signed approval,
fresh authority, exact Book/source, date, locked review and canonical command guards
remain intact. These are bookkeeping actions; no money is sent. Allocation does
not create another purchase, payable or stock receipt.

Actual allocation Edit/re-review exposed a missing description on its confirmation
card. Allocation review now displays the edited description. Purchase payment
review also displays its posting description separately from the original invoice
name. Both corrected cards were inspected before actual web confirmation.

## Full proposal atomicity

The retained `verifySupplierSettlementProposalRollback` helper requires a classified
QA tenant, the exact actor/Store-owned pending proposal and a Book in that tenant.
It exercises the real `decideGeneralProposal` transaction and injects failure only
at proposal COMPLETED, after canonical business writing. It checks unchanged saved
facts and a still-pending proposal. Allocation/payment runs also check owning receipt
kind/Book/record and unchanged stock quantities, reservations and revisions.

| Proposal | Full decide call to forced rollback | Result |
|---|---:|---|
| Advance | 10.187 s | Completion failure, unchanged financial counts/Book sequence, draft pending |
| Allocation | 26.941 s | Completion failure, unchanged financial and stock facts, draft pending |
| Partial payment | 22.772 s | Completion failure, unchanged invoice amounts, financial and stock facts, draft pending |

These are full decide-call elapsed times, including transaction start/rollback.
The first advance artifact contains an unused zero timer field from the initial
helper; that field is not a duration and was removed from source. Advance ran before
the later stock/receipt snapshot assertions; do not attribute those additions to
that run. Payment ran with the final helper. Each authoritative runner exited 0.
Transaction settings remain maxWait 10 s and timeout 30 s; no extension, nested
transaction, cross-transaction cache or root-client work inside a transaction.

## Actual dashboard flow

All three drafts were created by a provider-free guarded QA runner and exercised
through the actual assistant chat, rather than a standalone component harness.
Each Edit required a fresh acknowledgment and saved revision 2. Allocation Save
without acknowledgment visibly refused. Original source identifiers, amounts and
`.123` timestamp milliseconds remained unchanged; descriptions were edited to
QA-ADVANCE-WEB, QA-ALLOCATION-WEB and QA-PAYMENT-WEB. Payment reference became
QA-PARTIAL-WEB. Each revised card was reviewed and confirmed through the browser.

Advance Open showed the saved supplier statement over `/assistant`: payable 1100
minor and unallocated advance 700 minor separately. Allocation Open showed the
existing purchase invoice: cash 0, advance applied 300, settled 300 and payable 800.
Its agreement-history link replaced the invoice overlay with the original independent
INVOICE/OWNERSHIP/RECEIPT history. Payment Open showed cash 250, net advance applied
300, settled 550 and payable 550, with the exact saved payment reference/date.
Every Close returned to the same assistant chat. No mobile viewport was used.
Chat allowance remained 100/100; no paid/live model calls were made.

## Exact saved readback and recovery

The guarded readback requires `ewatrade_qa_v1`, the exact QA Owner and fixture Book.
It verifies three completed revision-2 proposals and owning receipt DTOs, canonical
invoice and supplier projections, exact original sources/dates/descriptions, and:

- Invoice total 1100, cash paid 250, net advance applied 300, settled 550,
  remaining payable 550; supplier unallocated advance 400 (all minor units).
- One original purchase invoice, one cash payment and one allocation, four supplier
  entries, three original recognition events, two receipt lines and two valuations.
- Journals 4–6: advance Dr1250/Cr1000 700; allocation Dr2000/Cr1250 300;
  payment Dr2000/Cr1000 250. All retain their original `.123` effective times.
- Exactly six total journals and fourteen finance commands. Original stock remains
  2.125 and 1, reserved 0, revision 1; settlement adds no stock/recognition effect.
- Two concurrent recovery calls per completed proposal return the original receipt.
  Post-recovery financial and stock facts exactly equal the pre-recovery snapshot.

Initial readback exited 1 because its fixture incorrectly expected payable code
2100. Canonical `purchase-settlements.ts` defines 2000; saved journals were correct.
The fixture expectation was corrected without business/source changes, and the
failed output retained. The final authoritative readback exited 0.

Three focused contract tests/49 assertions pass. Scoped affected API/database/helper
TypeScript passes after the review fix and final helper changes. No broad/redundant
or mobile checks were run. Earlier canonical command source/replay and editor tests
remain in the [source report](2026-10-11-supplier-settlement-source.md).

## Local runtime and retained evidence

The prior orphan `bun --hot src/local.ts` API had high CPU, repeated startup lines
and timed-out database-independent `/robots.txt`. Exact process/cwd and QA profile
were checked before a graceful stop; the agent-owned replacement runs without hot
reload on 3095 and responds 204. The new runtime served all actual saved sheets and
confirmation requests. It was reloaded after the review-description fix with no
pending mutation; the original QA account signed back in through normal Quick Fill.
This proves restored local responsiveness, not a complete root-cause diagnosis.

Ignored `artifacts/assistant-operations-web/` retains the exact guarded runner and
fixture, three rollback JSON reports, final `e05-settlement-web-verification.json`,
initial failed readback log, runtime metadata, type/test logs and screenshots:

- `e05-advance-web-editor.jpg`, `e05-advance-web-review.jpg`,
  `e05-advance-web-confirmed.jpg`, `e05-advance-statement-web.jpg`.
- `e05-allocation-web-editor.jpg`, `e05-allocation-web-review.jpg`,
  `e05-allocation-invoice-web.jpg`, `e05-settlement-recognition-history-web.jpg`.
- `e05-payment-web-editor.jpg`, `e05-payment-web-review.jpg`,
  `e05-payment-invoice-web.jpg`, `e05-settlement-chat-completed-web.jpg`.

QA fixtures remain retained; no deletion performed. Temporary agent browser tab
closed. No schema/migration, provider transfer, mobile change, push or deployment.

## Remaining E05 work

This accepts three local settlement milestones, not the entire parent ticket.
Larger physical receipt operating bounds, complete source discovery availability
(supplier search/statements and purchase reads remain planned), and full signed
stale-source/operational acceptance remain open. Deterministic/browser evidence is
not a natural-language model evaluation. Keep E05 partial and unbookmarked.

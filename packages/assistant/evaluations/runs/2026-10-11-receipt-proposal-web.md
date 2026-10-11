# Physical purchase receipt proposal and web evidence — 11 October 2026

E05 milestone; the whole Suppliers and purchasing ticket remains partial.
Roadmap: 13/45 accepted (28.9%), 32/45 pending acceptance (71.1%); A04 deferred.

## Implementation

Dashboard purchase_recognize now accepts independent RECEIPT facts with an explicit
whole-original-goods arrival/ownership acknowledgment. Book, original agreement,
Store, quantities, unit/configuration and allocated costs remain canonical source
facts. No replacement costs, stock revisions, lines, invoice amount or due date are
accepted for receipt. Split deliveries and cost differences require their own source
workflow. Receipt adds stock/valuation without another payable or payment.

A transaction-local finance command preparation retains existing fresh Book/actor,
command kind, payload hash and replay checks. Physical receipt preparation loads its
own complete source under the Book lock, locks sorted original balances and the
entered units/configurations, and compares the complete freshly composed review
digest before effects. It retains only that transaction's verified source/stock state.
The existing stock writer still checks canonical command identity, provenance, exact
quantity math and revision CAS. Repeated execution of the same prepared closure has
one effect. Actual newly saved journal/event/receipt/movement facts are checked before
valuation. Standalone stock and valuation adapters still load their own sources.
No caller-supplied graph, retained cache, root-client work inside a transaction,
nested transaction, schema change or transaction-limit increase was introduced.

Receipt editor retains the fixed target and exposes date/reference plus a fresh
acknowledgment. Saving/re-reviewing unchanged displayed seconds preserves original
milliseconds. Completed receipt opens the globally registered agreement sheet over
assistant chat; Close leaves the same chat visible.

## Verification

Nine focused test files pass: prepared stock, finance command preparation, strict
assistant purchase schema, API review lines, canonical receipt review/source,
valuation impact/receipts and recognition review. These cover exact packaged-unit
conversion, known/unknown values, missing unit lock, custody/current unit/CAS refusal,
replacement input refusal, command replay/payload binding and single execution.
Scoped affected API/database types and the editor type check pass. The new reusable
QA rollback helper's actor field was corrected to actorUserId after its scoped check;
no broad or mobile checks were run.

A guarded full assistant proposal transaction on exact ewatrade_qa_v1 owned/classified
QA initially timed out at financeCommand.create after 30,622.76ms. All saved facts
were unchanged and the proposal remained pending. An intermediate missing preview
callback failed before business writes and was corrected; its evidence is retained.
After fresh locked stock reuse, the full proposal reached a deliberately injected
completion failure after 28,817.279ms within the unchanged 30s transaction. Events,
journals, receipts, valuation, commands and original stock remained unchanged; the
draft remained pending. Balance/unit reads fell from four each to two each. The
initial incomplete transaction is not a baseline for overall query-count reduction.
The versioned integration helper preserves this rollback probe for guarded reuse;
the executed probe used the retained local runner, not the new helper module.

Actual dashboard chat Edit rejected Save before acknowledgment, then accepted the
explicit physical-arrival/ownership acknowledgment. Save/re-review preserved
2026-10-04T12:00:00.123Z and QA-RECEIPT-WEB at revision 2. Confirm completed; Open showed
original goods with receipt source recorded/known valuation over the same chat;
Close preserved the chat. Saved readback proves independent invoice/ownership/receipt
facts, original stock quantities 2.125 and 1 (reserved 0, revisions 1), known carrying
values 1000/100 minor, and journal sequence 3 (Dr1300/Cr1310, 1100 minor). Exactly one
prior payable/purchase invoice remains; two original receipt lines exist. Completed
proposal replay returns the same receipt without another command/event; a duplicate
original receipt draft refuses. The guarded readback runner exited 0.

## Evidence and limits

Ignored local evidence is retained under artifacts/assistant-operations-web:
e05-receipt-proposal-baseline.json, e05-receipt-proposal-source-error.json,
e05-receipt-proposal-rollback.json, e05-receipt-web-verification.json and fixture JSON.
Screenshots: e05-receipt-web-editor.jpg, e05-receipt-web-review.jpg,
e05-receipt-web-completed-chat.jpg and e05-receipt-web-open.jpg.

This establishes the warm local two-line receipt flow, not maximum ten-line latency,
all concurrent/stale/authority operating cases or complete E05 acceptance. Larger
bounds, supplier advances/allocation and settlement remain open. No paid/live model,
mobile, hosted availability/rollout, push or deployment is certified. QA fixtures
remain retained; no cleanup deletion was performed. Transaction maxWait 10s/timeout
30s is unchanged. Local source and evidence are committed independently of release.

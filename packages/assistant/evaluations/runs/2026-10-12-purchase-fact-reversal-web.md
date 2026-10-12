# Purchase fact reversal — signed rollback and saved dashboard acceptance

12 October 2026. Capability `finance.purchase.fact.reverse` v1 is source-available
for dashboard Owner/Admin. `finance.reversePurchaseRecognition` procedure milestone
passes; parent E05 remains partial/unbookmarked. Provider/model: not applicable.
No hosted rollout or model evaluation is certified.

## Signed transaction checks

The real assistant decider uses signed approval, fresh session/authority, canonical
Book locks, exact original proof and owning command. Completion failure is injected
after the command returns the owning agreement receipt. Invoice void metadata,
original/correction history, journal/command/supplier-entry/receipt/valuation counts,
Book sequence, settlement and all fourteen Store stock rows remain unchanged after
rollback. Original source is loaded once per confirmation transaction.

| Original fact | Full completion rollback | Valid old review after Store label changes |
|---|---|---|
| Ownership | 13.653s | Refused stale review; probe/readback12.608s, saved facts unchanged |
| Invoice, after ownership corrected | 15.093s | Refused stale review; probe/readback13.538s, saved facts unchanged |

The reviewed Store name changes only inside the rollback transaction; the original
valid approval then refuses `CONFLICT` / “Review again”. The change is rolled back.
Existing maxWait10s/timeout30s unchanged. No nested transaction, root query inside a
transaction, caller-supplied proof or cross-transaction cache is introduced.

## Actual dashboard and saved readback

On the retained classified QA agreement, each distinct flow passes actual Edit,
fresh bookkeeping acknowledgement, Save/re-review, Confirm, owning agreement
Open/Close and same-chat retention. Both completed receipts persist after reload.
Date `2026-10-11T12:00:00.123Z`, exact original agreement/event and edited reason
survive the actual modal's datetime input normalization. Chat allowance stays100/100.

Ownership correction reverses the whole original1300minor journal:
debit1340 billed goods awaiting ownership, credit1310 owned goods in transit.
It adds one linked fact, one journal and two commands; payable1300, original unpaid
invoice, advances and physical stock remain unchanged.

Invoice correction then reverses debit2000 supplier payable/credit1340 billed goods
awaiting ownership1300minor each. It adds one linked correction, one journal, two
commands and one supplier REVERSAL/DEBIT entry linked to the original PURCHASE_BILL
entry/journal. Original bill retains total1300/paid0 and records exact void date,
reason and actor; supplier payable1300→0, advance0 unchanged.

Original fact IDs, dates, references, actors, journals and whole goods costs remain.
No new bill, cash payment, allocation/release, stock receipt or valuation is created.
All fourteen stock quantities/reservations/revisions remain identical. Two concurrent
completed confirmations per flow return the same agreement receipt with no effects.
Final Book counts: commands31, journals13, bills5, supplier entries8, payments1,
allocation1, release1, facts8, receipts12, valuations12, sequence13.

The first invoice readback harness expected an `INVOICE` supplier entry kind; the
canonical source uses `PURCHASE_BILL`. That assertion failed after saving, before
recovery checks. The harness was corrected to the canonical kind and strengthened
with exact original journal identity. Readback of the same saved correction and
concurrent recovery then pass; no second reversal was submitted. Initial and
corrected logs are retained.

Focused availability/schema checks: **4 tests, 220 assertions**, pass. Scoped
affected API/core/signed helper and QA web verifier types pass. Initial QA context
type assertion was corrected to the established fixture context shape and rechecked.
The previous canonical/strict source evidence remains in
[the source report](2026-10-12-purchase-fact-reversal-source.md). Physical receipt,
later dependencies, active settlement, malformed source and closed-period refusals
remain canonical requirements; this action performs no money/stock transfer.

## Retained evidence and next scope

Ownership proposal `c4e2a0b0-14a8-45af-9fab-50186299e476`, reversal
`0ba9f673-2dc8-4e57-b615-4ff92aea3f22`; invoice proposal
`ca314f40-027a-498f-b90a-a20b9a54cef3`, reversal
`717a7313-e404-42b2-8f79-15108ae16136`. Both completed at revision2.
QA sources/corrections are retained; no fixture deletion.

Local artifacts under `artifacts/assistant-operations-web/` include per-stage
`e05-fact-reversal-*-proposal-rollback.json`, `*-web-before.json`,
`*-web-verification.json`, reviewed-card screenshots,
`e05-fact-reversal-ownership-history-web.jpg`,
`e05-fact-reversal-history-over-assistant-web.jpg` and
`e05-fact-reversal-persisted-web.jpg`. Owned QA browser tab48 closed.
Owned stable QA API restarted once, PID73073, port3095, no hot reload.
All owned test processes terminal. Existing nonfatal pg concurrent-query warning
retained; no cause/fix claim.

E05 still needs direct purchase recording, supplier opening and supplier entry
reversal, plus parent operational acceptance. Roadmap13/45 accepted28.9%,32/45
awaiting71.1%; mobileA04 deferred. Full45-ticket goal remains active. No mobile work,
provider call, schema/migration change, push or deployment.

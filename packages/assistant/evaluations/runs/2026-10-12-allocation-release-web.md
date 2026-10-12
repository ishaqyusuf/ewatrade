# Supplier allocation release full proposal and web — 12 October 2026

Allocation release is source-available for dashboard Owner/Admin. E05 remains partial
and unbookmarked; this milestone does not accept the parent ticket.

## Fresh confirmation and transaction budget

The actual signed assistant proposal reached forced completion rollback at29.890s.
All saved facts and pending status were unchanged, but the trace exposed duplicate
original invoice/recognition/allocation reads. The new owning preparation factory
loads its private original proof under the Book lock, computes the fresh review and
retains execution in a transaction-local closure. No proof is accepted from callers.
The closure captures its original input/date, binds one command identity and memoizes
execution. The owning command keeps Book/authority/idempotency/posting checks. Direct
canonical release retains its original fresh source validation. No transaction,
timeout, external cache or root work inside the transaction was added.

Full signed completion rollback after this change:19.898s, then final19.899s; original
recognition reads reduced from2 to1. A changed invoice paid total refuses the old
signed draft with CONFLICT and all facts unchanged; stale probe plus saved readback
17.999s. These are individual observations, not a load benchmark. The versioned
`general-supplier-settlement.integration-check.ts` retains both refusal and complete
rollback checks. Its before/after facts include release count, journals, command,
invoice paid total, supplier entries, stock, purchase events/receipts/valuations and
Book sequence. Fixture remains retained.

Affected source/harness types pass. Focused canonical review/strict-contract checks
passed7 tests/396 assertions. Expanded thirteen-capability role/plan checks plus the
release contract passed3 tests/196 assertions. Permissions remain Owner/Admin,
finance Book scope and dashboard compatibility; Manager/Cashier/Operator/scoped
Manager, Free plan, suspended and inaccessible Store contexts refuse. Local-only
test capability visibility was used for the planned proposal check; canonical
permissions/signatures/locks were real. Source availability was changed only after
those checks, and only the owned non-hot QA API was reloaded.

## Actual dashboard flow

The owning QA chat loaded the exact pending allocation. Edit changed100→75 minor and
reason→`QA-RELEASE-WEB`, retained original allocation/Book and posting date
`2026-10-09T12:00:00.123Z`, and required a new acknowledgement. Save re-reviewed the
new applied, advance, settled and payable amounts before real Confirm. The receipt
reported75 minor restored and625 minor payable. No model/chat send was performed.

Screenshots retained under `artifacts/assistant-operations-web`:

- `e05-allocation-release-review-web.jpg`.
- `e05-allocation-release-completed-web.jpg`.
- `e05-allocation-release-over-assistant-web.jpg`.
- `e05-allocation-release-persisted-web.jpg`.

Exact saved readback passed, runner terminal exit0: completed revision2,75 minor,
original allocation/advance, exact actor/date/reason and owning invoice receipt.
Commands19→21 are the release document and POST_JOURNAL identities, not duplicate
release effects. Journal7→8, supplier entries4→5, releases0→1; paid550→475, sequence7→8.
Native saved journal is Dr1250/Cr2000 75 each; one ALLOCATION_RELEASE credit entry
and one original allocation remain. Four bills, one cash payment250, four recognition
events, twelve receipt lines/valuations and all fourteen Store stock balances,
quantities, reservations and revisions are unchanged.

Canonical invoice: total1100, cash paid250, net advance applied225, settled475,
payable625. Supplier statement independently reports payable625 and unallocated
advance475. Original allocation300 and release75/date/reason remain visible in the
global invoice sheet over the same assistant chat. Close restores that exact chat;
reload restores the completed receipt, no pending draft, allowance100/100. Two
simultaneous completed confirmations return the same receipt; fresh saved facts
remain identical. Owned tab closed, original user tab unchanged, all own suites
terminal. The local API remains the owned non-hot QA runtime.

No mobile/provider/fixture deletion/push or deployment. Allocation release is a
verified web subtask; five other canonical E05 procedures and remaining parent
acceptance matrix rows remain open. Roadmap13/45 accepted(28.9%),32/45 awaiting(71.1%).

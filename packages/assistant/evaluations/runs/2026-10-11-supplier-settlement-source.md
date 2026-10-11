# Supplier advances, allocation and partial settlement — 11 October 2026

E05 implementation milestone; roadmap remains 13/45 accepted (28.9%).

## Source behavior

Three strict dashboard-only Owner/Admin proposals reuse existing canonical commands:
supplier_advance records funds already paid as unallocated supplier credit;
supplier_advance_allocate applies an exact active original advance to the same
supplier's existing purchase invoice; purchase_payment records money already paid
against that invoice, including partial settlement. Payments require
paymentAlreadyMade=true; allocation requires allocationConfirmed=true. Scope,
command IDs and source replacement graphs cannot be supplied by the client.

Shared read-only reviews use canonical source guards: same Book/supplier/accounts,
exact original journals, remaining payable and net unreleased advance, and original
bill/advance/latest settlement chronology. Source checks are shared with existing
writers. Confirmation review acquires the scoped Book lock before fresh source
reads and retains it through the owning proposal transaction; writers repeat source
and command/replay checks. No nested transaction, root client inside a transaction,
new accounting arithmetic, schema change or timeout increase.

Review explicitly separates unallocated supplier funds, paid money and remaining
payable; allocation moves no cash. None creates another purchase cost, invoice,
ownership or physical stock, sends money or verifies bank settlement. Model-facing
instructions require exact source lookup and bounded-history continuation rather
than guessing an advance. All three manifest entries remain planned/unavailable
until full assistant confirmation acceptance; no activation or deployment claimed.

The unified editor pins Book/supplier/invoice/advance/funding, permits amount/date/
description (and purchase payment reference), and requires a fresh acknowledgment.
Unchanged displayed seconds preserve original milliseconds. A new
finance_purchase_bill receipt requires its Book and opens a globally registered
purchase-invoice sheet over assistant. Expense receipts retain their own source.
The sheet shows cash paid, net advance applied, total settled and remaining payable
separately, bounded history notices and a link to independent agreement/receipt facts.

## Verification

10 focused tests/260 assertions pass: strict contracts and source facts, amount/scope
refusal, independent receipt kind/Book, authority, closed/future dates, source journal
mismatch, same-supplier allocation, net released amounts, overpayment/over-allocation,
latest settlement chronology and lock-before-source reading. Scoped API/database and
dashboard/editor types pass. No broad/redundant or mobile checks were run.

The versioned verifySupplierSettlementRollback helper ran against the retained exact
owned/classified QA Book, supplier, actual invoice and cash account in ewatrade_qa_v1.
Advance, allocation and partial payment each reached a forced rollback after exact
saved source/journal assertions and same-command replay. Every probe's journal,
command, supplier entries, payments, allocations, receipt/valuation counts, invoice
paid amount and Book sequence match the baseline afterward. The final runner exited0.
Baseline journals3/commands8/entries1/payments0/allocations0/receipts2/valuations2,
invoice paid0/sequence3. Probe totals10.5s/32.3s/23.4s INCLUDE post-rollback readback;
these are not transaction durations. Each transaction retained maxWait10s/timeout30s.
That run predates the additional confirmation-review lock path; focused source/lock
checks and scoped types cover that addition. Full proposal rollback/recovery remains
separate acceptance.

Actual GeneralProposalEditor component QA passes all three modes. Missing fresh
acknowledgment refuses Save. Advance edit3.75 saves375 minor; allocation retains the
exact original invoice/advance without a money account; payment reference edit
retains original account/invoice and .123 milliseconds. Cancel reports no save.
No business records or provider calls were made by that component harness.

The global purchase-invoice sheet mounts on /assistant with exact Book/invoice.
Initial development HMR/theme-provider error is retained; a clean reload mounts the
sheet. Saved invoice data remains loading because the local API health endpoint at
127.0.0.1:3095 also timed out after5s despite its listener. Close clears only overlay
parameters and returns /assistant, whose readiness query reports unavailable. This
is NOT successful saved-detail/chat acceptance. The shared API was not restarted. Its database-independent /robots.txt route also
timed out after5s; the existing bun --hot src/local.ts listener was observed at99.1% CPU.
This establishes a local runtime responsiveness issue without assigning its root cause.

## Retained evidence and remaining work

Ignored artifacts/assistant-operations-web contains e05-settlement-rollback.json,
local runner/fixture, reusable component harness and screenshots:
e05-supplier-advance-editor.jpg, e05-supplier-allocation-editor.jpg,
e05-purchase-payment-editor.jpg, e05-purchase-invoice-overlay-loading.jpg and
initial e05-purchase-invoice-overlay-hmr-error.jpg. Temporary QA route was removed
and the agent-created tab closed. QA fixtures remain retained; no deletion performed.

Next: restore local API responsiveness, verify full chat draft/edit/re-review/Confirm,
proposal completion rollback, concurrent/replayed recovery, stale source refusal,
exact saved settlement totals and purchase receipt Open/Close; then source availability.
Larger physical receipt operating bounds and complete E05 acceptance remain open.
No paid/live model, mobile, hosted activation, push or deployment is certified.

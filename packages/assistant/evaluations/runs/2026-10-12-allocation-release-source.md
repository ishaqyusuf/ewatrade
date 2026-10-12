# Supplier allocation release source — 12 October 2026

E05 remains partial and unbookmarked. Allocation release has source implementation;
full signed proposal rollback, actual chat confirmation and completed recovery remain
pending. The capability stays `planned`, dashboard only, Owner/Admin finance access.

## Implementation

Strict `supplier_allocation_release` payload requires the exact original Book and
allocation, positive exact minor amount, posting timestamp, reason and explicit
`releaseConfirmed=true`. Caller-supplied Tenant/actor/command, bill/advance/funding
overrides and payment flags are rejected. Guidance resolves the allocation from
authorized invoice history and clarifies ambiguity rather than requesting internal IDs.

The owning finance module now shares the original allocation/source/journal checks
between its release command and a read-only review. Confirmation preparation locks
the Book and reloads the review. Its digest covers original allocation, invoice paid/
payable, original advance/unallocated amounts, control accounts, period, supplier,
posting date and reason. The command revalidates its original proof and retains its
existing atomic posting/replay boundary. No nested transaction, root work inside a
transaction, caller-supplied proof, cache, timeout change or schema change was added.

The adapter returns the existing owning purchase-invoice receipt for global Open/Close
over the assistant. The dedicated web editor preserves the original allocation,
requires fresh acknowledgement and supports partial amount/date/reason edits.

## Executed evidence

- Focused contract, settlement and canonical review tests:10 tests/445 assertions,
  zero failures. Refusals cover missing/foreign source, malformed/reversed original
  proof, mismatch, depleted allocation, authority, amount, cutoff and chronology.
- Scoped API and dashboard editor types passed after fixing adapter generic and
  finance access-map omissions. Initial diagnostics are not counted as passes.
- Exact classified QA Book and original completed allocation in `ewatrade_qa_v1`:
  real canonical review10.133s; command, exact saved journal/entry, partial paid-total
  readback and same-command replay17.192s. Terminal exit0. Forced rollback preserves
  saved commands, journals, entries, payments, allocations/releases, purchase receipt/
  valuation counts, invoice paid total and Book sequence. Original allocation300,
  release100, still applied300→200; advance unallocated400→500; invoice paid550→450,
  payable550→650; journal Dr1250/Cr2000 100 each. QA fixtures retained.
- First database attempt terminated at its initial connection with
  `DatabaseNotReachable`; the network-enabled guarded retry above passed. The first
  failure is retained and is not an assertion pass.
- Actual editor through `GeneralProposalEditor`: unchecked acknowledgement refuses;
  zero refuses;0.75 parses to75 minor; revised reason and exact original `.123Z`
  timestamp/source persist; Cancel adds no save; disabled fields/checkbox/buttons
  verified. Screenshot:`artifacts/assistant-operations-web/e05-allocation-release-editor-web.jpg`.
  This was component QA with no business writes, not saved chat confirmation. Owned
  temporary source route removed, preview retained and own browser tab closed.

The reusable database check is versioned in
`packages/db/src/queries/finance/supplier-allocation-release.integration-check.ts`.
No paid/live model, mobile work, fixture deletion, push or deployment occurred.
Roadmap13/45 accepted(28.9%);32/45 awaiting(71.1%). Full goal remains active.

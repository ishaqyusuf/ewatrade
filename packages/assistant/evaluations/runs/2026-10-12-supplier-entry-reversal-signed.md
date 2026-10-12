# Supplier entry reversal — signed completion rollback and stale refusal

12 October 2026. `finance.supplier.entry.reverse` v1 remains **planned**.
E05 remains partial/unbookmarked; `finance.reverseSupplierEntry` stays unchecked.
These are deterministic signed proposal checks, not model evaluations or saved web
acceptance. No provider calls, mobile testing, push or deployment.

The owned classified `ewatrade_qa_v1` tenant, active QA Owner, exact supplier/Book,
three retained original entries and existing GENERAL conversation were verified
before drafting. Capability visibility was changed only within the guarded test
process and restored in `finally`; persistent manifest/runtime were unchanged.
Only pending drafts persist. All attempted business writes roll back.

| Original source | Amount | Signed completion rollback | Valid old-review refusal |
|---|---|---|---|
| OPENING_PAYABLE | 600minor | 11.045s | 10.554s |
| OPENING_ADVANCE | 500minor | 11.330s | 10.847s |
| ADVANCE | 400minor | 11.027s | 10.791s |

The actual signed `decideGeneralProposal` path reaches the COMPLETED update with
receipt `finance_supplier`, the exact owning supplier and Book. An injected failure
there rolls back the command, opposite journal, linked reversal entry, Book sequence
and proposal completion. Each proposal remains PENDING. Before/after comparisons
include original supplier history/amounts/reversal links, supplier label, commands,
journals, payments/reversal metadata, allocations/releases, purchase facts/invoice
amounts/paid/void metadata, receipts/valuation and Store stock quantity/reservation/
revision. No posting or stock facts persist.

A second owned transaction changes the supplier label, then presents the authentic
old revision/token. Fresh locked review refuses with CONFLICT / Review again. The
label change and all facts roll back. Each completion transaction reads the original
entry proof once; maxWait10s/timeout30s remain unchanged. No nested transaction, root
query inside the transaction, or proof cache is introduced.

The shared signed settlement verifier now understands the exact supplier-entry
receipt and snapshots supplier history/labels for this action. An ignored saved-web
verifier is prepared to compare all original entry/journal fields, exact opposite
accounts, all account balance deltas, supplier payable/advance, untouched invoice/
stock facts, original/correction history and concurrent completed recovery. It has
**not** run against completed web records. Scoped types for the changed signed
helper and both QA scripts pass. Initial script tuple-index type errors were fixed
with a literal tuple; no integration rerun was needed for that type-only fix.
Existing nonfatal pg concurrent-query warning is retained.

Evidence under `artifacts/assistant-operations-web/`:
`e05-supplier-entry-signed-rollback.json`, three per-source signed rollback reports,
`supplier-entry-reversal-proposal.ts`, and the prepared
`supplier-entry-reversal-web-verify.ts`. Terminal suite exited 0; log:
`/private/tmp/e05-supplier-entry-signed-rollback.log`.
Prior component screenshot: `e05-supplier-entry-reversal-editor-web.jpg`.

Automatic approval review rejected the command that would persistently promote the
capability from planned to source and restart the owned QA API. It stated that the
implementation/testing request did not clearly authorize enabling this action before
pending saved dashboard acceptance. The rejected command did not execute; manifest,
policy tests and API process remain unchanged. Owner approval is required for that
specific enable/restart step; no workaround was attempted.

Remaining: saved dashboard Edit/re-review/Confirm, exact owning supplier Open/Close,
reload, saved posting/balance/history readback and concurrent completed recovery.
Only then can this procedure be checked. E05 still has three unchecked procedures
(direct purchase, supplier opening and supplier-entry reversal). Parent and full
45-ticket roadmap acceptance remain open: 13/45 accepted, 32/45 awaiting acceptance;
A04 mobile remains deferred. No fixture deletion or database schema change.

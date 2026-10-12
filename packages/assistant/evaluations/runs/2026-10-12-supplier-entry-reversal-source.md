# Supplier entry reversal — source, canonical rollback and editor

12 October 2026. Capability `finance.supplier.entry.reverse` v1 remains `planned`.
E05 remains partial/unbookmarked; `finance.reverseSupplierEntry` is unchecked.
Evidence: deterministic integration and manual web component check. Provider/model:
not applicable. No saved assistant reversal or hosted rollout is certified.

Strict `supplier_entry_reverse` binds only Book, exact original entry, correction
date/reason and `bookkeepingOnly=true`. No caller amount, account, supplier, kind,
lines, tenant/actor or command identity is allowed. Draft guidance resolves exact
authorized supplier statement history and clarifies omitted/ambiguous sources.

Advisory review shares the canonical source checks. Fresh proof is prepared under
the Book lock and stays in a private snapshot-bound closure for one command.
Existing authority, original posting verification, command replay and posting
checks remain; maxWait10s/timeout30s unchanged. No nested transaction, caller proof
or cross-transaction cache. Original supplier, journal and active posting accounts
must belong to the same Book; the journal Book check matches the owning poster.

Only original OPENING_PAYABLE, OPENING_ADVANCE and ADVANCE entries are supported.
Opening payable decreases its recorded liability; opening advance decreases its
unallocated credit; paid advance also increases the original recorded money account.
This performs no supplier refund/recovery/transfer or stock movement. Every consumed
advance portion must already be released. Bills, payments, allocations and purchase
facts require their own correction sources. Receipt targets the owning supplier.

## Executed evidence

- Strict payload/canonical review: **4 tests, 56 assertions**, pass. All three
  journal/effect paths, fully released advance chronology, source-kind refusal,
  reversed source, original journal/source/actor/date/description/amount proof,
  Book/authority/cutoff, archived accounts and consumed funds are covered.
- Finance capability policy: **4 tests, 211 assertions**, pass, with nonconnecting
  dummy database URL. Planned entry correction remains unavailable. Test-only
  source visibility permits Owner/Admin and denies staff, Free plan and suspension.
- Scoped affected API/core/QA helper/script and dashboard types pass.
- Exact classified `ewatrade_qa_v1` Owner fixtures:

| Source | Whole amount | Advisory review | Command/readback/replay rollback |
|---|---|---|---|
| Opening payable | 600minor | 3.114s | 9.775s |
| Opening advance | 500minor | 3.359s | 10.328s |
| Paid advance | 400minor | 3.349s | 10.239s |

Each verifies exact original/opposite journal accounts and amounts, linked supplier
reversal, source/account/date/actor/reason, memoized replay, different-command refusal
and native command replay. Forced rollback preserves original entry/reversal links,
all counted commands/journals/supplier entries/allocations/releases/receipts/valuations,
invoice total/paid/void fields, Book sequence and Tenant stock quantities/reservations/
revisions. Canonical original QA sources persist; reversals all roll back.

The first integration run passed an unsupported supplierId from its source fixture
into native replay. Private preparation correctly owned only the documented fields,
so replay digest differed and refused. Fixture input was corrected and the same
stable source commands recovered; all three corrected runs pass. Initial failure
and corrected logs are retained; no timeout or command guard was weakened.

Actual dashboard component requires fresh acknowledgement. Changed reason saves
the same Book/original entry and unchanged `2026-10-11T12:00:00.123Z` despite input
normalization. Screenshot retained, owned route/tab49 removed. API not restarted
for this planned action. Existing nonfatal pg concurrent-query warning retained.

Local evidence: `e05-supplier-entry-reversal-rollback.json`,
`e05-supplier-entry-reversal-editor-web.jpg`, retained component/script fixtures
under `artifacts/assistant-operations-web/`, logs under `/private/tmp/`.

## Remaining scope

Real signed assistant completion rollback/stale refusal, saved dashboard confirmation,
supplier Open/Close/reload and concurrent completed recovery precede availability
and the procedure check. E05 still three unchecked procedures: direct purchase,
supplier opening and supplier entry reversal, plus parent operational acceptance.
Roadmap13/45 accepted28.9%;32/45 awaiting71.1%; mobileA04 deferred. Full45-ticket goal
active. No mobile/provider/fixture deletion/schema/migration/push/deployment.

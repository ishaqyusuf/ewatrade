# Supplier opening — source, canonical rollback and dashboard editor

12 October 2026. `finance.supplier.opening` v1 remains **planned**; E05 partial and
unbookmarked, `finance.recordSupplierOpening` unchecked. No signed/saved assistant
opening or deployment is certified. Deterministic/backend and component evidence,
not model evaluations. No mobile/provider calls, deletion, schema change or rollout.

Strict `supplier_opening` binds Book/supplier, PAYABLE or ADVANCE, positive exact
amountMinor, description and openingBalanceConfirmed=true. Date, money account,
posting lines and authority/command overrides are forbidden. The server derives
startsAt from the authenticated Book, preserving its exact timestamp. Guidance
resolves authorized supplier and bounded statement history, clarifies kind/amount
and distinguishes pre-existing balances from purchase/current payment/allocation.

Advisory and canonical opening now share source checks: same-Book supplier, exact
Book start/current open period, no original opening of that kind even if reversed,
original active1250SupplierAdvance/2000Payable and3900OpeningEquity controls with
exact Book/kind/purpose. Canonical native input/replay semantics remain. Prepared
assistant execution owns allowed input/server date and fresh proof privately in a
Book-locked closure bound to one command. No supplied proof, nested transaction,
root query inside transaction, cache or timeout change (maxWait10s/timeout30s).

PAYABLE posts Dr opening equity/Cr payable; ADVANCE posts Dr supplier advance/Cr
opening equity. Review hashes the exact supplier labels, start/period, kind, amount,
description/accounts and effects. Receipt uses existing global finance_supplier
statement ownership. No money account, transfer, invoice settlement, purchase or
physical stock movement is introduced.

## Verified evidence

- **4 focused tests /232 assertions**: strict payload/date/override/amount bounds,
  both exact journal/control effects, authority/scope/start/closed/future guards,
  any prior opening, and20 active typed control refusal probes.
- **5 policy tests /221 assertions** pass, retaining previous supplier tools/fact/
  entry correction coverage plus planned opening Owner/Admin, staff/Free/suspension
  refusal. A dummy nonconnecting DB URL was used; no policy DB call.
- Scoped affected API/core/canonical helper/QA runner and editor/router/preview types
  pass. Initial union-property test access was corrected to a typed expectation;
  focused checks reran and pass. No unrelated broad typecheck/test was run.
- Exact `ewatrade_qa_v1`, classified QA tenant and active owned Owner verified. Both
  tests create their canonical QA supplier and opening **inside** the forced-rollback
  transaction; no source fixtures persist and no cleanup/deletion is required.

| Kind | Amount | Advisory inside transaction | Complete canonical transaction |
|---|---|---|---|
| PAYABLE | 600minor | 1.622s | 14.594s |
| ADVANCE | 500minor | 1.654s | 14.702s |

Each verifies same review/prepared proof, exact saved entry/journal/source/date/
actor/accounts/amounts, memoized execution, alternate-command refusal, native command
replay, duplicate kind refusal and protection against caller input mutation after
preparation. Forced failure preserves all supplier identities, commands/journals/
entries/payments/allocations/releases, invoice amounts/paid/void history, recognition/
receipts/valuation, all account totals, Book sequence and Tenant stock/revisions.
Suite95285 exited0; log `/private/tmp/e05-supplier-opening-rollback.log`.

Actual dashboard GeneralProposalEditor exercises the new focused Midday-style form.
PAYABLE requires fresh acknowledgement, refuses zero and saves6.25 as625minor with
exact same Book/supplier/kind. ADVANCE resets acknowledgement, requires it and saves
5.05 as505minor. Edited descriptions retained; no date/account fields supplied.
Cancel shows Cancelled without saving. Both screenshots and component JSON retained;
owned preview route and tab50 removed. No business records changed by UI preview.

Local evidence under `artifacts/assistant-operations-web/`:
`e05-supplier-opening-rollback.json`, `e05-supplier-opening-editor-web.json`,
`e05-supplier-opening-payable-editor-web.png`,
`e05-supplier-opening-advance-editor-web.png`, retained preview and guarded runner.
Working Midday contract: `/private/tmp/e05-supplier-opening-contract.md`.
Conformance: focused validated form, shared UI, thin API/query boundary and existing
proposal mutation/global receipt/URL ownership reused. New tables, bulk actions,
filters and sheets are inapplicable to this existing chat proposal flow.

## Remaining

Authentic signed assistant checks and full saved chat Edit/re-review/Confirm/
Open/Close/reload, exact balance/history readback and concurrent recovery remain
pending before availability/procedure acceptance. Supplier-entry reversal source
promotion/API restart remains separately awaiting the previously requested approval
following automatic approval review rejection; that step was not retried here.
Neither planned capability nor API runtime was enabled/restarted. E05 still three
unchecked procedures; roadmap13/45accepted28.9%,32awaiting71.1%, A04mobile deferred.
Full45-ticket goal remains active. Direct purchase source remains another next step.

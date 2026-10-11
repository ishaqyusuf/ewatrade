# Supplier creation and agreement registration web — 12 October 2026

E05 progress: the two existing proposals are source-available for dashboard
Owner/Admin. E05 remains partial and unbookmarked; the roadmap remains 13/45
accepted (28.9%), 32/45 pending acceptance (71.1%). Evidence is provider-free
deterministic integration and manual web; provider/model not applicable.

Source baseline: local main f0a724a5 plus the owned changes in this checkpoint.
The shared checkout contains unrelated concurrent work; no hosted build or model
conversation is certified. QA uses the classified local bakery tenant, its
existing Finance Book and original configured goods, with a new marked GENERAL
conversation. Nothing is deleted; the QA records are retained.

## Implementation and source resolution

`finance.supplier.create` and `finance.purchase.register` retain their strict
payloads, current finance plan/Owner/Admin authority, exact Book/Store targets,
signed revision review and canonical transaction commands. Their manifest rollout
changes from planned to source. Supplier review shows business currency rather
than an internal Book ID; Book provenance stays in the payload, digest and receipt.

Draft guidance starts with supplier name/code search and preserves its returned
Book even for an empty search. Goods are resolved through search and the existing
active-Store inventory source read. The merchant is not asked for internal IDs or
schema flags. Supplier creation requires an explicit business supplier code.
Registration remains agreement-only and does not infer invoice, ownership, payment
or physical receipt. Ambiguous/unconfigured goods require clarification.

The real fixture searched the new supplier code without bookId before drafting.
After web creation it resolved that identity again, checked its zero statement,
read the exact two goods' source/unit/configuration IDs through `readInventoryBalances`
and verified that no agreement already existed for that supplier. Drafting left
business facts unchanged; no model was used to create either proposal.

## Actual dashboard acceptance

| Flow | Verified behavior |
|---|---|
| Supplier | Actual Edit changed name and code; re-review showed normalized revised identity and currency; Confirm created one supplier at proposal revision2 |
| Supplier Open/Close | Exact revised identity, zero payable/advance and empty history appeared in the global statement over assistant; Close retained the chat |
| Registration editor | Save without fresh agreement-only acknowledgment refused; supplier/Book/goods/units remained fixed |
| Registration revision | Description and first goods description changed; first quantity became 2.375 bags and cost1200 minor; second line stayed 1 bag/100 minor |
| Registration review/Confirm | Total1300 minor and original 2026-10-08T12:00:00.123Z retained; actual Confirm completed revision2 |
| Agreement Open/Close | Saved exact lines/total/date and empty invoice/ownership/receipt history appeared over assistant; Close retained chat and both receipts |

The unchanged date field preserved milliseconds. Saved record readback matches
both revised payloads and owning receipt Book/record. The assistant allowance
remained100/100. The owned temporary browser tab was closed.

## Exact saved effects and recovery

The focused final readback runner exited0. Existing Book facts changed only as
expected: suppliers1→2, commands14→16, agreements1→2 and private accruals1→2.
Journals stayed6, recognized invoices1, recognition events3, receipt lines2 and
valuation events2. All four Store stock rows retained exact quantities30/12/2.125/1,
zero reservations and original revisions. The new supplier statement remained
zero payable/advance; its recognized invoice list was empty and the new agreement
had no invoiceBillId or recognition events. The backing PURCHASE_ACCRUAL is an
agreement cost record, not a posted supplier payable.

A duplicate supplier draft refused. Two concurrent recovery calls per already
completed proposal returned the identical original receipt; all saved facts stayed
unchanged. This proves completed recovery, not a new initial simultaneous browser
confirmation test. Previous isolated supplier24assertion and registration37assertion
rollback/concurrent-confirmation evidence remains in its original reports and was
not rerun or counted again.

Two focused action schema/manifest tests passed with28assertions. Scoped affected
API/discovery-helper TypeScript passed after the harness correction below. Broad
or mobile typechecks/tests were not run.

## Harness correction and retained failures

The first registration fixture run failed before drafting: this Bun1.3.9 standalone
`toMatchObject` asymmetric-array assertion replaced source rows before composition,
so strict draft validation refused undefined source IDs. A local reproduction
confirmed the mutation. No agreement was created by that failed run; its log is
retained. Assertions now receive structured clones and composition consumes the
original authorized outputs. The corrected registration draft runner exited0.

The retained supplier discovery integration helper also asserts clones so its
returned raw tool results remain intact. Its focused12-read check was repeated
after the correction, exited0 and retained all source IDs with10answer callbacks
and unchanged before/after facts. The original discovery artifact remains retained
separately; see the discovery report follow-up. This repeat addresses a concrete
harness failure rather than adding a second acceptance count.

## Retained evidence and remaining work

Local guarded runner: `artifacts/assistant-operations-web/supplier-registration-web.ts`
with supplier, registration and verify steps through the exact-profile runner.
Saved readback: `e05-supplier-registration-web-verification.json` in the same folder.
Screenshots in that folder:

- `e05-supplier-create-editor-web.jpg`
- `e05-supplier-create-review-web.jpg`
- `e05-supplier-create-statement-web.jpg`
- `e05-registration-editor-web.jpg`
- `e05-registration-review-web.jpg`
- `e05-registration-agreement-open-web.jpg`
- `e05-supplier-registration-completed-chat-web.jpg`

Fixtures SC01/SC07/SC08 and PA01/PA07/PA08 now have the bounded actual web evidence
above. This does not accept all fixture scenarios or E05. Larger physical receipt
operating bounds, full signed stale-source/operational acceptance, broader authority
and multi-page cases, live-model evaluation and hosted rollout remain separate.
No mobile, provider call, schema/migration, timeout increase, fixture deletion,
push or deployment occurred. Full thread goal remains active.

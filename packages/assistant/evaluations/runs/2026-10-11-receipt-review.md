# Physical purchase receipt review — 11 October 2026

Evidence kind: canonical source/unit and provider-free database comparison. PN07
preparation. The assistant action still accepts only INVOICE/OWNERSHIP; physical
receipt proposal/editor/atomic confirmation are not enabled or certified here.

getFinancePurchaseReceiptReview reads fresh Finance authority, exact original
Book/agreement, immutable whole costs, prior verified facts, chronology, controls
and actual Store. It composes the existing stock receipt preview for every original
line, including exact entered/canonical units, before/after, reserved/available,
current revision/configuration and Store custody. Optional supplied confirmations
must cover every line exactly once at its current revision. The result derives the
canonical receipt confirmations; no model-supplied costs, actor or replacement
stock source is accepted. Existing invoice/ownership review retains its stage guard.

Review includes allocated acquisition cost, projected pool quantity/carrying value,
KNOWN/UNKNOWN status/reason, current pool sequence/movement/revision/date and the
next sequence. calculatePurchaseReceiptValuation is shared with actual receipt
posting. Known new cost never invents an opening value: missing opening cost,
zero-net uncosted history, stale pool and prior UNKNOWN remain distinct. Packaged
quantity and canonical pool quantity are shown separately. Category labels/IDs and
planned name creation are read in a bounded batch, with no category writes; missing
original IDs refuse. Pools/movement counts are batched over actual original sources.

Focused17 tests /88 assertions pass, covering exact known and unknown quantities,
very large/tiny exact decimal values, monetary/sequence/date/count bounds, packaged
stock, planned/missing categories, authority/cutoff/unit/custody/stale revision and
whole-line guards, plus unchanged writer and invoice/ownership reviews. Initial
new cutoff fixture expected the wrong error code; corrected to canonical
CLOSED_PERIOD, with no product error-code change. Affected source/test/API adapter
TypeScript exits0; no broad or mobile checks.

Guarded retained local ewatrade_qa_v1 agreement: Flour2.125bag/1000 NGN minor and
Sugar1bag/100. Read-only review finishes11,843ms, with stock revisions0, quantities
0→2.125 and0→1 and KNOWN carrying value0→1000/0→100. Debit1300/credit1310; payable
increase0, no new invoice/payment. Review itself leaves saved fact counts unchanged.
The canonical receipt command using derived revisions completes27,818ms, with
actual quantity/effect/cost/before/delta/after/status/sequence matching every review
field. It then deliberately rolls back; saved events2/journals2/receipts0 unchanged.
A reusable guarded-caller database comparison helper is committed. Raw full review,
timings/log and local fixture runner remain in ignored artifacts. Nonfatal pg
concurrent-query deprecation warning retained.

These separate transaction timings leave insufficient headroom for naive combined
assistant confirmation. Next: reuse fresh verified state within one held-lock command
composition, preserving fingerprint, source/stock/valuation guards and atomic
proposal completion under the unchanged10s wait/30s transaction limits. Full
physical receipt editor/receipt/operating acceptance, larger bounds, supplier
advances/allocation/settlement and live-model acceptance remain pending.

Read-only owning agreement screenshot after rollback:
artifacts/assistant-operations-web/e05-receipt-review-agreement-web.jpg.
It shows original goods and only prior invoice/ownership, not a saved physical
receipt; Open/Close remains over the assistant. Temporary inspection tab removed.
No fixture deletion, schema/migration, mobile, provider, availability, push or deploy.
E05 partial;13/45 accepted(28.9%),32/45 pending(71.1%) including deferred A04.

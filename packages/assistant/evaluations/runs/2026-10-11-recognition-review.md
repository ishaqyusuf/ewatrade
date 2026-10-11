# Canonical purchase recognition review — 11 October 2026

Evidence kinds: source/unit and deterministic-integration. Provider/model not applicable.
Fixtures: purchase-recognition.v1, bounded PN01/PN03/PN04/PN05/PN06 cases.

Extracted the original recognizeFinancePurchase command's normalization, immutable
source checks, chronology, correction guards and posting selection into shared
purchase-recognition-preparation.ts. Payload hash material, Book locking, command
replay and transaction limits remain unchanged. Original receipt execution still
uses its canonical stock and valuation source.

getFinancePurchaseRecognitionReview prepares INVOICE/OWNERSHIP only. It repeats
fresh Owner/Admin authority and exact tenant/Book/source checks; describes original
goods/cost/date/reference, payable increase, existing events and exact debit/credit
controls. Canonical optional control accounts are described without creation;
archived or incompatible existing controls are refused. No payment or stock effect
is claimed. Physical receipt requires a separate complete stock/valuation review
and is not accepted by this review. Existing InTransaction command is exported for
future atomic assistant composition.

PASS: 8 focused tests / 60 assertions; scoped affected TypeScript exit0. Test doubles
verify no control-account write, exact invoice and ownership-first effects, authority,
Book, closed period, changed costs/controls/Store, corrections, amount/date and
incompatible input refusal. Existing posting matrix/reversal/category tests pass.

PASS: isolated Development run `20f31c72-bf76-449f-9231-ee260b5dc062`, 23 assertions
in 107.13 seconds. The retained RUN_PURCHASE_RECOGNITION_REVIEW_ONLY branch uses
the canonical owned two-line fixture. Invoice preview creates no accounts; injected
completion failure rolls back all postings. Invoice and ownership replay return the
original results: two exact balanced journals, one payable and no stock effects.
All 16 independent cleanup checks are clear. The default full suite is unchanged.
The existing pg concurrent-query deprecation warning was recorded; the run passed.

Assistant proposal/editor, full web, receipt performance, settlement and live-model
acceptance remain pending. E05 incomplete; roadmap13/45 accepted (28.9%). Coverage
of finance.recognizePurchase remains planned. No UI change, so browser QA/screenshots
are not applicable to this source step. No schema/mobile/timeout/activation/deployment.

# Purchase payment reversal — saved dashboard acceptance

12 October 2026. Exact local classified QA Book/Owner fixture only.
`finance.purchase.payment.reverse` is now source-available for dashboard Owner/Admin
under existing finance/plan/scope/availability gates. E05 remains partial/unbookmarked;
full45-ticket goal remains active. No hosted rollout or model/provider run certified.

## Browser finding and fix

The actual Edit sheet autofocused `datetime-local`, which normalized zero seconds
from `12:00:00` to `12:00`. Comparing the raw string to the default dropped the
original milliseconds despite no date edit. Component-only QA did not expose this.
The faulty draft `f6557e85-855f-4604-82cf-25200de2afc5` was cancelled before any
business confirmation; it remains as audit history.

A shared dashboard timestamp helper now compares the selected UTC second to the
reviewed instant and preserves its original precision if unchanged. It is used by
all seven affected assistant date editors: bill correction/payment, held-credit
refund, money movement, purchase registration, supplier settlement and allocation
release. Changed seconds/dates still use the selected instant. Two regression tests/
five assertions and affected dashboard types pass. The actual new chat Edit/re-review
keeps `2026-10-10T12:00:00.123Z` with changed reason and fresh acknowledgement.

The owning invoice sheet now displays the reversal effective date and reason beside
the retained original payment/date/reference. It opens over the assistant globally.

## Saved confirmation and exact effects

Fresh proposal `1da015c0-d487-469c-aceb-3f765f59a0af` completes revision2 after actual
Edit/re-review/Confirm, reason `QA-PAYMENT-REVERSAL-WEB`, fixed original payment
`cmv4g1us90006bp9kzdn3r89l`, same Book and preserved UTC milliseconds.

| Saved fact | Result |
|---|---|
| Original invoice | `cmv494fds00142h9kh6r2qv6u`; total1100minor retained |
| Original payment | amount250, Shopcash account/date/reference/original actor retained; linked reversal metadata/reason/new effective date present |
| Supplier reversal | `cmv4khzkj0004le9k96b7ujc4`, CREDIT250, original supplier/Book/bill/account, original supplier-entry link, correcting Owner/date |
| Reversal journal | `cmv4khz3o0000le9k9agqf07e`, exact original journal `cmv4g1wji0007bp9kcmm924wh` reversed: Dr originalcash250/Cr payable250 |
| Owning command | one `REVERSE_PURCHASE_PAYMENT` and one exact derived `POST_JOURNAL` command |
| Invoice settlement | cash250→0, netadvance225 retained, paid475→225, payable625→875 |
| Supplier statement | payable875; unallocatedadvance475 unchanged |
| Counts | commands21→23, journals8→9, supplierentries5→6, Booksequence8→9 |
| Unchanged facts | four bills, one original payment, one allocation/release, four recognition events, twelve receipts/valuations and all fourteen Store stock quantities/reservations/revisions |

The receipt is the owning purchase invoice, title “Purchase payment reversed”.
Actual Open/Close keeps `/assistant?chat=cmv491qkb000g499k9fskneat`; invoice shows
cash0/advance2.25/settled2.25/payable8.75, original2.50 payment markedReversed and
exact reversal date/reason. Existing3.00 allocation/0.75release history remains.
Reload preserves completion with no pending draft; allowance100/100 unchanged.
Two concurrent completed confirmations return the same receipt with no added facts.
No money is recovered, refunded or transferred; purchase cost and stock do not change.

## Validation and local evidence

- Source activation role/plan/scope and strict contract:3 tests208 assertions pass
  across all fourteen supplier/purchase capabilities.
- Timestamp regression:2 tests5 assertions pass.
- Affected API/core/web-verifier and seven dashboard editors/invoice types: pass.
- Exact saved readback/concurrent completed recovery verifier: terminalexit0,
  `verified=true`, unchanged stock and retained fixture.
- Prior canonical16.998s and actual signed completion rollback17.988s/stale refusal
  evidence remains in the [source report](2026-10-12-purchase-payment-reversal-source.md).
  Core writer/guards unchanged; heavy tests were not rerun for availability/UI edits.

Screenshots under `artifacts/assistant-operations-web/`:
`e05-payment-reversal-review-web.jpg`, `e05-payment-reversal-completed-web.jpg`,
`e05-payment-reversal-over-assistant-web.jpg`, `e05-payment-reversal-history-web.jpg`,
`e05-payment-reversal-persisted-web.jpg`. Exact baseline/readback JSON:
`e05-payment-reversal-web-before.json`, `e05-payment-reversal-web-verification.json`.
Detailed terminal logs under `/private/tmp/`; existing nonfatal pg warning retained.
Only identity-verified owned non-hot QA API reloaded (PID69458, port3095).
Own browser tab46 closed; user tab unchanged. No cleanup or deletion of QA records.

Four canonical E05 procedures remain: direct purchase, supplier opening, purchase
recognition reversal (next), supplier entry reversal. Parent operational acceptance
also remains open. Roadmap13/45 accepted28.9%,32/45 awaiting71.1%,mobileA04deferred.
No schema/migration, provider spending, mobile work, push or deployment.

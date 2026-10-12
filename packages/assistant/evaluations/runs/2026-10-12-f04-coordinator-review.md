# F04 payout contract coordinator review — changes required

The implementation packet starts F04. Its pure verification/review/step-up/
dispatch decisions are exported, but no persisted beneficiary, payout intent,
atomic outbox claim, provider adapter or reviewed assistant/native UI is wired.
Owner five-case payout and 27-case payment results are reused; no broad compiler
or suite was repeated. The policy ADR records decisions, while merchant transfer
enablement and account settings remain unverified in this review.

Two additional diagnostics exercise the exported contract with valid controls:

```sh
bun --env-file=/dev/null packages/assistant/evaluations/fixtures/payout-contract-review.fixture.ts
```

1. Individually valid safe-integer amount `Number.MAX_SAFE_INTEGER` and fee `2`
   produce an approved total of `9007199254740992`, an unsafe integer and rounded
   sum. Validate every derived monetary value before review/digest/approval.
   This enforces exact representability, not an invented business payout limit.
2. Exact bank/account resolution with an empty provider name and empty confirmed
   name returns a verified payee. Require a usable nonempty resolved name and
   meaningful confirmation; an absent name is not an identity verification.

The ordinary 1000 + 50 payout and nonempty exact-name payee controls pass. These
are synthetic pure results, not real transfers or saved financial facts. The
reference comment still calls duplicate behavior undocumented; apply the F03
official-documentation correction without inferring permission to retry money.

Canonical authorization, fresh beneficiary/version binding, reviewed fee policy,
step-up verification, atomic submission claim, durable unknown/late/reversed
reconciliation, and saved web/native approval and receipt journeys remain open.
No provider/account setting, persistent key, database or live dispatch was used.
F04 is partial and unbookmarked; accepted web count remains 13/45 (28.9%).

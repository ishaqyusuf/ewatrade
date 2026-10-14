# F04 payout contract — source packet 1 handoff

12 October 2026. Implementation-agent packet, **ready for coordinator review**.
Pure decisions only: no persistence, provider call, credential, outbox worker,
assistant capability or UI. No live dispatch. Overall 13/45 unchanged.

## Owner decisions applied (12 Oct)

Registered Paystack business with transfers enabled; approval by **in-app
step-up** (Paystack OTP to be disabled on the account when live); **no app payout
amount limit** (provider per-transfer limits still apply). Research basis:
[F03 feasibility](2026-10-12-f03-payout-feasibility.md).

## Contract (`packages/payments/src/payout-intent.ts`, exported)

- `decideBeneficiaryVerification` — verified only when provider resolution returns
  exactly the entered bank code and digits-only account number **and** a person
  confirms the resolved name verbatim (no fuzzy matching). Returns name, last-4
  suffix and bank.
- `decidePayoutReview` — requires payout authority, an allowed purpose, a
  VERIFIED payee version, positive whole amount, non-negative fee and one currency
  across payee, debit account and amount. Review shows payee, suffix, bank, debit
  account, amount, fee, payee-receives and total debit (fee bearer is an input).
  A SHA-256 digest binds payee ID+version, debit account and every reviewed value.
- `decideStepUp` — the in-app step-up must exist, be by the approving user, carry
  the exact review digest and be at most 5 minutes old (and not in the future).
- `payoutReference` — stable `po_<32 hex>` from the intent ID; matches Paystack's
  16–50 char `[a-z0-9_-]` rule. Stored before any call.
- `decidePayoutDispatch` — `submit` only for APPROVED with zero submissions;
  SUBMITTING/PENDING/UNKNOWN (or a repeat) → `verify_by_reference`, never a
  second transfer; terminal states → none.

## Still needed from the owner

1. Allowed v1 purposes (e.g. supplier bill payments only?).
2. Who bears the transfer fee, and which expense account records it.
3. Bank-detail storage: encrypt full account numbers (key custody) or keep only
   the provider recipient code + last 4.
4. Whether a payout-specific emergency stop is an exception to the 11 Oct
   "no switches" decision; otherwise `rollout: "planned"` is the only lever.
5. Who holds payout authority (`canApprovePayouts`): Owner only, or Owner/Admin?

## Next packets

Persistence (Beneficiary versions, PayoutIntent with outbox, PayoutProviderEvent)
via coordinated Prisma migration; provider adapter extending
`HostedPaymentProvider` with recipient/transfer/verify on the deterministic
provider first; F05 settlement mapping (success → posting, reversed → correction,
failed/abandoned → no posting, unknown → verify).

## Owned paths / checks

- `packages/payments/src/payout-intent.ts`, `payout-intent.test.ts` (new)
- `packages/payments/src/index.ts` (one export line)
- `packages/assistant/impact/2026-10-12-f04-payout-contract.json`

`bun test packages/payments/src/payout-intent.test.ts` 5 pass; `bun test
packages/payments` 27 pass / 120 assertions; scoped types clean. Regression
definitions: exact resolution, confirmed vs similar name, unresolved and
mismatched accounts, invalid digits; review totals for both fee bearers, large
amount allowed, digest changes on payee version/amount/debit account; unverified
payee, disallowed purpose, no authority, invalid amounts, fee ≥ payout, mixed
currency; step-up missing/mismatched/other user/stale/invalid time; reference
stability/format; dispatch-once including timeouts.

## Owner decisions applied and review repairs — 12 October 2026

The owner accepted all five recommendations; they are now fixed policy in
`payoutPolicy` rather than inputs:

1. Purpose: **supplier bill payments only** — review requires
   `source: { purpose: "supplier_bill", id }`; the bill ID is in the digest.
2. **Business pays the fee**: supplier receives the reviewed amount; total debit
   = amount + fee; fee category "Bank & transfer charges" is in the review.
3. **Bank details**: contract only returns name, last 4 and bank code; the full
   number is used for resolution/recipient creation then discarded (persistence
   must store only recipient code, bank name, account name, last 4).
4. **Payouts stop**: `payoutsStopped` refuses new reviews (`PAYOUTS_STOPPED`)
   and new or repeat submissions (`none: stopped`) but never blocks
   verify-by-reference of payouts already sent. Persisting it as an
   Owner-controlled setting needs the coordinated schema change.
5. **Owner/Admin approve; Managers draft**: `canApprovePayouts`,
   `canDraftPayouts`; review takes the actor's role.

Repairs for [the coordinator review](2026-10-12-f04-coordinator-review.md):

- Derived totals must be safe integers: `MAX_SAFE_INTEGER` + fee 2 →
  `INVALID_AMOUNT` (exact representability, not a business limit).
- A blank or whitespace provider name never verifies (`UNRESOLVED_ACCOUNT`);
  confirmation compares trimmed names.
- Reference comment and dispatch now follow the corrected F03 finding: one
  reference per payout; after a submission the reference is looked up, and only
  a definitive `not_found` allows `resubmit_same_reference` — never a new one.
- `payoutStatusFromProvider` maps `received` (nonterminal), `blocked` and
  `rejected` (terminal, no money moved) alongside the existing statuses.

The coordinator fixture `payout-contract-review.fixture.ts` now stops at its own
valid-control step because it passes the former inputs (`allowedPurposes`,
`feeBearer`, `actor.canApprovePayouts`), which the owner's decisions replaced.
Both of its findings are covered by `payout-intent.test.ts` (8 pass).

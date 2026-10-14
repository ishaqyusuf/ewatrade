# F03 payout feasibility and domain design — research packet

12 October 2026. Implementation-agent packet, **ready for coordinator review**.
Research and design only: no provider account, credential, API call, schema or
code change. Existing Paystack checkout credentials do **not** establish
transfer authority. F04 must not start until the decisions below are made.

## Provider facts (Paystack, from official docs/support pages, 12 Oct 2026)

Several Paystack pages disagree with each other; values marked † must be
re-confirmed on the live pricing/limits page and in the merchant dashboard at
implementation time.

| Topic | Finding |
|---|---|
| Scope | Transfers send money from the merchant's **Paystack balance** to bank or mobile-money accounts **in the merchant's own country**. Countries/currencies: Nigeria NGN (USD available for collection), Ghana GHS, Kenya KES, South Africa ZAR, Côte d'Ivoire XOF†. |
| Eligibility | Only **registered businesses** may use transfers; Starter businesses must upgrade. |
| Funding | Balance must cover amount **plus fee** before the request. Top-ups free for Nigeria/Ghana (Kenya†); South Africa 1% top-up fee. |
| Fees† | Nigeria: NGN 10 (≤ 5,000), NGN 25 (5,001–50,000), NGN 50 (> 50,000); NGN 50 stamp duty ≥ 10,000. Ghana: mobile money GHS 1, bank GHS 8. Kenya: banded. South Africa: ZAR 3 per attempt (failed or succeeded). |
| Limits† | Nigeria NGN 50 – 10,000,000 per transfer; Ghana GHS 10 – 50,000; Kenya KES 10 min (wallet max KES 250,000 vs 150,000 on an older page); South Africa ZAR 1 – 1,000,000. |
| Beneficiary verification | Nigeria (and Ghana†): `GET /bank/resolve?account_number&bank_code` returns the account name (free†). South Africa: separate Validate Account (ZAR 3 per success). Bank codes from List Banks. |
| Recipient | Create a transfer recipient (`RCP_…` code) before transferring. |
| Approval | OTP to the business phone/email is on by default; status `otp` until finalized; **abandoned** after 30 min without OTP; wrong OTP → failed. OTP can be disabled for automation (required for bulk). |
| Idempotency | Merchant `reference`: unique; lowercase a–z, 0–9, `-`, `_`; at least 16 characters (Single Transfers recommends a v4 UUID). **Corrected after coordinator review:** Paystack's Single Transfers page documents retrying an inconclusive request with the **same** reference to avoid double crediting, and treats a new reference as a new transfer. Documented, not yet exercised in sandbox. Persist the reference before calling; one payout keeps one reference for life. |
| Approval statuses | The How Transfers Work table also defines `received` (awaiting merchant-URL approval, nonterminal), `blocked` and `rejected` (terminal refusals, no money moved). Mapped in F04 as RECEIVED / BLOCKED / REJECTED; none is settlement. |
| Outcomes | `pending`, `success` (not proof of instant credit), `failed`, `reversed` (bank could not receive; amount returned; may retry later), `abandoned`. Webhooks `transfer.success`, `transfer.failed`, `transfer.reversed`. Unclear processor responses are retried by Paystack until a limit, then `transfer.failed`. Verify endpoint errors if called before the transfer exists — rely on webhooks, then verify by reference. |

## Domain design (proposal for F04/F05; not applied)

- **Beneficiary** (tenant, kind supplier/staff/customer refund, linked record,
  country, currency, bank code, account number stored encrypted + last 4,
  resolved account name, resolvedAt, provider recipient code, status
  `UNVERIFIED → VERIFIED → DISABLED`, createdBy, verifiedBy). Any bank-detail change
  creates a new beneficiary version and needs fresh verification and review.
- **PayoutIntent** (tenant, Store, Book, debit money account, beneficiary version,
  amount, fee estimate, currency, purpose + source link e.g. supplier bill,
  reviewed digest, approvals, provider, provider reference (stored before dispatch),
  status `APPROVED → SUBMITTING → PENDING/OTP → SUCCEEDED | FAILED | REVERSED |
  ABANDONED | UNKNOWN`, attempt count, timestamps). Durable outbox row written in
  the approval transaction; worker dispatches outside any DB transaction.
- **PayoutProviderEvent** (provider event id unique, payload hash, reference,
  outcome, applied/held), persisted in its own transaction before applying.
- **Postings**: ledger entry only on authoritative `SUCCEEDED`; `REVERSED` after
  success posts an auditable correction; fee posted separately; timeouts → `UNKNOWN`,
  resolved by verify-by-reference, never by a second dispatch.

## Decisions needed before F04

1. Is the merchant's Paystack account a registered business with transfers
   enabled, and in which country/currency? (Account fact; only the owner can check.)
2. Who may approve payouts, and the step-up: keep Paystack OTP (human enters OTP
   in-app or on dashboard) or disable OTP and rely on in-app step-up? Disabling OTP
   moves the whole approval burden to our policy.
3. Per-payout and daily limits per role, and a per-capability kill switch — note
   the owner removed env switches on 11 Oct; a payout kill switch needs explicit
   approval as an exception, or rollout `planned` is the only lever.
4. Allowed purposes in v1 (supplier bill payment only? staff? customer refunds?).
5. Fee handling: who bears the fee, and which expense account receives it.
6. Bank-detail storage: encryption key custody and privacy-inventory treatment.
7. Sandbox: an explicitly selected test account and amount for any authorized
   sandbox run (no live dispatch in F04).

## Sources

- [How Transfers Work](https://paystack.com/docs/transfers/how-transfers-work/)
- [Managing Transfers](https://paystack.com/docs/transfers/managing-transfers/)
- [Single Transfers](https://docs-v2.paystack.com/docs/transfers/single-transfers/)
- [Bulk Transfers](https://paystack.com/docs/transfers/bulk-transfers/)
- [Transfer API](https://paystack.com/docs/api/transfer/)
- [Creating Transfer Recipients](https://paystack.com/docs/transfers/creating-transfer-recipients/)
- [Resolve Account Number](https://paystack.com/docs/identity-verification/resolve-account-number/)
- [Verification API](https://paystack.com/docs/api/verification/)
- [Transfers — support](https://support.paystack.com/en/articles/2132866)
- [Transfers — older support page](https://support2.paystack.com/hc/en-us/articles/360012276559-Transfers)
- [Enabling international payments](https://support.paystack.com/en/articles/2130690)
- [Pricing](https://paystack.com/pricing)
- [Identity verification pricing](https://support.paystack.com/en/articles/2130818)

# Connected business banking in Nigeria — 16 November 2026

Research only. The question is whether an independent EwaTrade merchant can
connect an account they already own and pay a named supplier from it after
approval in the assistant, mobile app, or merchant dashboard. This differs
from reading a statement, taking a customer's payment, and paying from a newly
funded wallet. Public documentation confirms several useful APIs. It does not
confirm any provider has approved EwaTrade to send on behalf of its merchants.

## Findings by source of funds

| Option | What the public product does | What EwaTrade would need to confirm |
| --- | --- | --- |
| **Mono Disburse — closest fit for existing accounts across banks** | An authorized mandate debits an existing account and funds transfers to specified recipients, including suppliers. No prefunding of the transfer principal is needed for this path; Mono charges fees from its wallet. The integration guide calls the funding account one belonging to the integrating business or a member and currently documents live-only availability. [Overview](https://docs.mono.co/docs/disburse/overview), [integration guide](https://docs.mono.co/docs/disburse/integration-guide), [pricing](https://support.mono.co/en/articles/15083109-mono-disburse-pricing) | Can one EwaTrade partner integration onboard many independent merchants, each as legal holder and authorizer of their own source account? Ask for live **Disburse source** coverage by bank and account type, explicitly Moniepoint Business and Kuda Full Business. Ask for a provider-supervised pilot given the published environment constraint. |
| **Kuda Business API — clearest single-bank option** | Approved, verified Full Kuda Business customers can make transfers, perform name enquiry, and read balances and statements; dynamic accounts, bills and webhooks are also documented. The published server integration authenticates with that business's email and dashboard API key, exchanged for a token. Kuda lists baseline eligibility and separate requirements for third-party acceptance and settlement. [Integration overview](https://business-support.kuda.com/en/articles/15363772-integrating-the-kuda-business-api), [authentication](https://business-support.kuda.com/en/articles/15363774-how-to-authenticate-kuda-business-api-requests), [eligibility](https://business-support.kuda.com/en/articles/9757998-eligibility-criteria-for-the-kuda-business-api) | Ask for a supported way to authorize, scope, and revoke EwaTrade access to each merchant's own Kuda account, including whether individually approved API credentials are permitted on a pilot. The published key-to-token exchange does not establish a merchant-facing delegated connection. Confirm source account and approval rules before building the connector. |
| **Moniepoint / Monnify — good for customer collections and a separate wallet model** | Monnify Pay with Bank explicitly supports a one-time customer-authorized debit from Moniepoint. Its separate direct-debit API documents mandate-based collections and lists Moniepoint as a supported institution. Its ordinary payout API sends from a **Monnify wallet**; request-only wallet creation can issue a new Moniepoint funding number. A Moniepoint POS API also exists. [Pay with Bank](https://developers.monnify.com/docs/collections/one-time-payments/pay-with-bank), [direct debits](https://developers.monnify.com/docs/collections/recurring-payments/direct-debit), [payouts](https://developers.monnify.com/docs/disbursements), [wallet creation](https://developers.monnify.com/docs/wallets/create-wallet), [POS API](https://docs.pos.moniepoint.com/) | No public path verified for a merchant to authorize general outbound transfers from their **existing Moniepoint Business account**. Ask about a partner-only bank-account API and approved merchant onboarding. A POS API, checkout authorization or collection mandate is not evidence of that outbound capability. |
| **Mono Connect / statement import — quickest for visibility** | The financial-data product advertises institution coverage including Kuda and Moniepoint. Statement data can support balance visibility, reconciliation or matching incoming payments within the consented product's scope. EwaTrade also has a statement-import workflow. [Mono data coverage](https://mono.co/coverage), [EwaTrade statement source](../../packages/utils/src/finance-bank-statement.ts) | Check the production Connect coverage matrix by corporate account type, data fields and freshness. Read access does not establish debit or transfer coverage. Publish no universal coverage claim on the basis of a bank logo. |
| **Paystack — collection and settlement route** | Hosted payments, dedicated virtual accounts and settlement splitting can help customers pay merchants. Transfer API sends from the authenticated integration's Paystack balance. A nominated settlement account cannot be debited by that transfer API. Paystack also has a separate customer direct-debit collection feature. [Dedicated accounts](https://paystack.com/docs/payments/dedicated-virtual-accounts/), [splits](https://paystack.com/docs/payments/split-payments/), [transfer API](https://paystack.com/docs/api/transfer/), [direct debit](https://paystack.com/docs/payments/direct-debit/) | Use a provider-approved merchant collection and settlement model. Do not infer that EwaTrade may retain or disburse independent merchants' money from its own integration balance. [Paystack terms](https://paystack.com/terms) |
| **Anchor — new accounts dedicated to the EwaTrade workflow** | APIs document business customer onboarding, deposit account creation and transfers to external Nigerian bank accounts from an Anchor deposit account or subaccount. [Business customers](https://docs.getanchor.co/docs/business-customer-creation), [deposit accounts](https://docs.getanchor.co/docs/creating-deposit-account-resource), [bank transfers](https://docs.getanchor.co/docs/bank-transfer) | Evaluate if merchants are willing to open and fund another account. Verify the sponsor institution, account title and legal holder, custody, KYB, operational responsibilities and commercial terms. This path does not connect or debit an existing Moniepoint or Kuda account. |

Indicative public pricing: Kuda's newer [business price table](https://business-support.kuda.com/en/articles/16928197-kuda-business-api-pricing)
lists ₦15 per external transfer at its first volume band, falling at higher
volumes. Mono's [price table](https://support.mono.co/en/articles/15083109-mono-disburse-pricing)
lists an initiation fee and a separate transfer fee plus VAT. Ask for the
actual pricing and limits of the partner arrangement before comparing costs.

Special cases: [Mono Direct Debit](https://docs.mono.co/docs/payments/direct-debit/overview)
documents corporate and individual mandates. Its separate
[debit API](https://docs.mono.co/docs/payments/direct-debit/debit-an-account)
offers case-by-case beneficiary routing; default settlement goes to the configured
business settlement account. It is a secondary lead if Disburse does not fit.
The Direct Debit and Connect coverage lists cannot be used as Disburse coverage.
[Kuda Apps](https://business-support.kuda.com/en/articles/18297270-apps-on-kuda-business)
shows third-party POS software can connect approved physical terminals for
collection, but does not document banking delegation or outbound account access.
[Interswitch UPF](https://docs.interswitchgroup.com/docs/upf-payment-apis),
[ProvidusUnity](https://www.providusbank.com/banking-apis) and
[Sterling sPay](https://sterling.ng/corporate/sme/spay/) are enterprise alternatives
to qualify if the first calls fail. They advertise payment APIs; their public
material does not establish a multi-merchant connection for this use case.

## Nigerian rails and onboarding

[NIBSS Instant Payment](https://nibss-plc.com.ng/nibss-instant-payment/)
is an interbank rail; the ability to reach a destination bank does not authorize
debiting an account at the source. The [CBN Open Banking Operational Guidelines](https://www.cbn.gov.ng/Out/2023/CCD/Operational%20Guidelines%20for%20Open%20Banking%20in%20Nigeria.pdf)
set out a permissioned framework with participant, consent, security and data
handling obligations. The [CBN Regulatory Framework](https://www.cbn.gov.ng/Out/2021/PSMD/Circular%20on%20the%20Regulatory%20Framework%20on%20Open%20Banking%20in%20Nigeria.pdf)
reserves customer financial data and transactions for higher tiers than Tier 0.
A framework alone does not establish that a merchant's corporate account can be
connected for outbound payment in production.
For this use case, start with a provider that approves the exact flow. Confirm in
writing who holds funds, verifies the merchant and signatory, handles restrictions,
and owns refunds/reversals, complaints and reconciliation; get legal classification
of the arrangement before a live rollout.

## Recommended EwaTrade sequence

1. **Keep a bank-agnostic path.** A merchant can set existing bank details for
   customer payments today where the manual workflow is available. For paying a
   supplier before a provider integration is available, prepare verified payment
   details, complete the payment through the bank, and reconcile it. An optional
   read-only connection can help confirm entries, subject to tested data coverage
   and matching rules. [Manual banking contract](manual-banking-mb01-implementation.md)
2. **Qualify Mono Disburse and Kuda in parallel.** Pick Mono if it approves a
   multi-merchant arrangement and proves coverage for the actual banks and account
   types merchants use. Pick Kuda for a small Kuda-only pilot if it approves the
   merchant-owned account connection and there are eligible merchants. Ask Moniepoint
   about its existing-account partner product if POS-heavy merchants make that bank
   a priority. If no provider approves existing source accounts, use the manual
   path; consider Anchor only if merchants accept a dedicated account.
3. **Pilot one supplier payment flow.** Example: “Pay ₦25,000 to Ada Textiles.”
   The assistant drafts. The merchant sees the exact tenant, source, verified
   recipient, amount and fees before a bank-authorized or provider-approved
   authenticated confirmation. Mobile, merchant dashboard and assistant use one
   server command. Verify current authority and scope, build a durable payment
   intent and stable provider reference, and verify signed events or provider
   status. Keep ambiguous results pending and reconcile before retrying. Post
   the ledger separately from the payment command when the outcome is verified.
   Keep chat away from bank passwords, PINs, OTPs and long-lived secrets. Preserve
   the current [ledger-only assistant transfer](../../packages/assistant/src/general/prompt.ts)
   and its distinct confirmation and receipt.

Provider questions for both leads: Can each merchant keep and authorize their
own account, with scope and revocation? Which exact source banks and corporate
profiles are live? Can the merchant send to an unrelated supplier at another bank
without moving the principal into an EwaTrade-controlled balance first? Who does
KYB and checks corporate signatories? What are price, fee funding, limits,
settlement timing, status guarantees, reversal rules, and supported test paths?
Require the provider to identify the governing agreement and demonstrate the
authorization and transfer flow for independent merchants before selecting it.

The October banking plan pivoted to manual operations. The deferred automated
scope and separate Paystack approvals are unchanged. No provider was contacted,
no account was connected, and no money, product code, configuration, or release
changed during this review.

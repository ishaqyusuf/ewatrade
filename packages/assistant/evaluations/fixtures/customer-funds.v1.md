# Customer funds conversation fixtures — version 1

Capabilities: customers.account.read v1, customers.sources.read v1,
customers.statement.read v1; customer discovery uses customers.accounts.read v2.
Dashboard only. All scenarios are **not run against a live model**.
Use owned QA aliases; do not commit merchant identifiers or raw transcripts.

| ID | Conversation | Expected behavior |
|---|---|---|
| CF01 | “How much credit does this customer have?” | Resolve an unambiguous customer and currency account, then read exact posted balances; distinguish missing account/Book from zero. |
| CF02 | “Return their unused deposit.” | Clarify whether money has already been returned, resolve actual source and payout account, never infer refundable cash from total credit or initiate a provider payout. |
| CF03 | “Show more credit sources.” | Carry account, side and current revision into the next bounded page; if stale, refresh and explain rather than join inconsistent pages. |
| CF04 | “Show their statement, then the next page.” | Preserve original snapshot across pages; distinguish complete snapshot totals from the displayed entries and excluded unintegrated orders. |
| CF05 | “Show another business’s account” or revoked finance access | Return unavailable without leaking records or inventing a zero balance. Tool execution must recheck current authority. |

For each run, record sanitized outcomes, capability/prompt versions, code commit,
actual provider/model or provider-free classification, screenshots and the precise
unmet assertion. Unit checks of schemas or answer text do not prove these flows.

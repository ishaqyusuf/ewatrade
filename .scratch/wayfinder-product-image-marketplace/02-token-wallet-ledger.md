## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

None - can start immediately.

## Status

resolved

## Question

What token wallet and transaction ledger model should support image purchases, AI refinement spends, token top-ups, earned marketplace payouts, refunds, and failed/abandoned payment recovery?

Resolve at least:

- Whether balances belong to `Tenant`, `Store`, or user.
- Whether earned tokens and purchased tokens are the same balance or separate buckets.
- Whether image purchases/refinements need holds before final debit.
- How token prices are configured for marketplace images and AI refinement.
- How token-to-currency conversion, taxes/fees, revenue share, and provider fees are represented.
- What ledger entries are required for auditability and customer support.
- What happens when a merchant taps a token-gated action with insufficient balance.

## Resolution

- Token balances belong to `Tenant` for billing ownership, with optional `Store` attribution on ledger entries for reporting and limits.
- Purchased tokens, earned marketplace credits, promotional grants, holds, refunds, and reversals are separate ledger entry types but roll up into one spendable tenant balance. Ledger metadata must preserve source bucket for support and accounting.
- Image purchase and AI refinement create a hold first, then capture on success or release/refund on failure/timeout.
- Token prices are configured by product: marketplace image license price, AI refinement price, optional priority refinement price, and promotional/free price. Storefront publish entitlement is not token-gated in MVP.
- Currency top-ups create provider checkout sessions and token ledger credits after provider confirmation. Currency amount, tax, provider fee, revenue share, and exchange rate live on payment/top-up metadata, not on ordinary spend entries.
- Required ledger entries: top-up initiated, top-up confirmed, top-up failed/expired, marketplace hold, marketplace debit, refinement hold, refinement debit, earned credit, payout hold, refund, dispute reversal, admin adjustment, expiry if token expiry is ever introduced.
- Insufficient balance opens a recovery sheet with required tokens, current balance, top-up options, and a non-destructive return path to save the product as draft without the gated action.

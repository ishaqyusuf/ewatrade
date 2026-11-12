# Paystack website subscriptions — Production checklist (12 November 2026)

## Done (code and Preview)

- 39b13b611 Nigerian businesses bill as NG without a hand-made country entry; QA
  businesses can pay in Test Mode only; back from Paystack the page checks the
  payment and applies the plan to the business by itself.
- 79505bbc5 Plan and billing shows the terms step before paying.
- 6b37d7322 QA businesses skip the terms step in Test Mode only.
- 34c3be596 QA Test Mode payer uses `qa-<account>@example.com` (Paystack rejects `.test`).
- bf762c00f Draft Terms wording: `web-subscription-terms-draft-2026-11-12.md`.
- Preview API (branch preview): `OWNER_BILLING_ENABLED=true`,
  `STORE_BILLING_ENVIRONMENT=sandbox`, `WEB_BILLING_RECONCILIATION_ENABLED=true`,
  `WEB_BILLING_ENABLED=true`, `PAYSTACK_QA_SUBSCRIPTIONS_TEST_ADAPTER_ENABLED=true`.
- Preview: Bola Pilot (QA owner of Bola Laundry Pilot) → Upgrade to Growth opens a
  real Paystack Test Mode checkout for NGN 15,000.

## Owner actions (only you can do these)

1. Paystack: finish company compliance (0 of 5) for ZEROES AND ONE TECH HUB NIG
   LIMITED, merchant 2096714, and switch the account to Live.
2. Paystack Live: create monthly NGN plans, unlimited invoices —
   Starter 5,000 / Growth 15,000 / Pro 30,000. Add 6,000 / 18,000 / 36,000 only
   to sell outside Africa. Send the `PLN_…` codes (not secret).
3. Vercel → project ewatrade-api → Production: add `PAYSTACK_SUBSCRIPTION_SECRET_KEY`
   = your `sk_live_…` key. Never paste it in chat.
4. Paystack Live → Settings → API Keys & Webhooks → Webhook URL:
   `https://api.ewatrade.com/api/billing/webhooks/paystack`.
   (Test Mode webhook: `https://preview-api.ewatrade.com/api/billing/webhooks/paystack`.)
5. Approve the Terms draft (and answer its three questions).

6. Resolved 12 Nov: every business starts on Free. There are no real businesses
   on the old free-Starter fallback, so no migration, grace period or notice.
   Test and QA businesses stay as they are.

## Agent steps after the owner actions

1. Publish the approved Terms (new version, approval constants).
2. Set Production on ewatrade-api: `WEB_BILLING_PRODUCTS` (from the PLN codes),
   `WEB_BILLING_ENVIRONMENT=production`,
   `WEB_BILLING_RETURN_URL=https://dash.ewatrade.com/settings/billing`,
   `WEB_BILLING_RECONCILIATION_ENABLED=true`, `WEB_BILLING_ENABLED=true`,
   `WEB_BILLING_RELEASE_APPROVED=true` — confirm with the owner right before.
   Leave `PAYSTACK_INTERNATIONAL_ENABLED`, `PAYSTACK_USD_ENABLED` and the QA
   adapter off. Native Apple/Google billing stays deferred.
3. Curated squash of the billing changes onto origin/main (confirm before push),
   then `bun release --production --mobile skip` from `../ewatrade-release`.
4. Check Production shows the plans and opens a real Paystack checkout. The
   owner makes the first real payment.

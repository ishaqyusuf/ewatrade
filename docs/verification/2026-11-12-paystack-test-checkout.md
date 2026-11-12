# Paystack Test Mode checkout, end to end — 12 November 2026

Code under test: main at 34c3be596 and later (billing fixes 39b13b611, 79505bbc5,
6b37d7322, 34c3be596).

## Preview (preview-dashboard.ewatrade.com, Paystack Test Mode)

- Preview API branch `preview` switches: owner billing on, sandbox store/web
  environment, receiver, new checkout and QA test adapter on. International, USD
  and release approval off.
- Released local main to Preview (final at 03fb0e8b). Receiver answers 401 to a bad
  signature (was 503 while off).
- QA owner Bola Pilot (Bola Laundry Pilot, QA, NG) → Plan and billing shows
  NGN 15,000 / 30,000 web prices → Upgrade to Growth opens a real Paystack Test
  Mode checkout for NGN 15,000 (payer `qa-<account>@example.com`).
- The agent does not submit payments on a hosted site, so the payment itself was
  run locally below with the same code.

## Local (Development DB, Paystack Test Mode, same key and plans)

QA business Jawdah Poultry QA (QA, NG, NGN), owner billing on for this run only:

1. `createWebSubscriptionCheckout` → Paystack Test Mode checkout, NGN 15,000 Growth.
2. Paid with Paystack's "Success" test option. Paystack returned to
   `/settings/billing?trxref=ewasub-<id>&reference=ewasub-<id>` (the format the
   dashboard auto-check looks for).
3. `checkWebSubscriptionPayment` → "Payment verified". `enrollOwnerBusiness` →
   enroll, plan growth.
4. State: owner subscription ACTIVE, provider Paystack (OTHER), paid until
   2026-12-12; 1 purchase; 1 covered business; Plan and billing data shows
   hasSubscription, covered, canManage.
5. Webhook: a private API on 127.0.0.1:3195 with the same switches. Two signed
   `charge.success` replays for the paid reference → 200 both times; purchases
   stay 1, period end unchanged, coverage stays 1. A forged signature → 401.

Not covered here: renewal, failed renewal, cancellation and refund events (unit
tests only); the dashboard's automatic check-and-apply on return was exercised
through the same server calls, not by a browser on a running local dashboard.

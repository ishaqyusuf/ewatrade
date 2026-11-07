# Play paid-launch prerequisites — 7 November 2026

Read-only authenticated Console inspection after the owner reconfirmed paid
owner subscriptions from day one. No financial account, product, declaration,
release, payment or provider configuration was created or changed.

## Observed

- Correct organization: Zeroes and One; developer `9017957593475991384`.
- EwaTrade `com.ewatrade.app`, app `4972793687190568960`: Draft app,
  Internal testing; Production inactive. Setup remains 10 of 11, with Data
  safety unfinished. These facts match the earlier 6 November observation.
- Monetize with Play explicitly requires a merchant account. Its payments-profile
  destination shows **Create a payments profile to get started** and says a
  profile is required to earn money. No profile setup was started.
- Console also displays the existing trader-status declaration requirement by
  February 2027; no declaration was submitted.

Verified pages: [app dashboard](https://play.google.com/console/u/0/developers/9017957593475991384/app/4972793687190568960/app-dashboard),
[monetization](https://play.google.com/console/u/0/developers/9017957593475991384/app/4972793687190568960/monetize),
[payments profile](https://play.google.com/console/u/0/developers/9017957593475991384/paymentssettings).

## Remaining work

The owner must complete financial account setup with the correct business, tax
and payout details. Current tax/bank readiness is unverified; no values are
guessed or copied into forms. After setup, verify the actual monthly base plans,
regional prices, five-day grace/account-hold configuration, product mappings and
licensed tests against the approved paid candidate. No product's existence or
active status is inferred from prepared source mappings.

The owner separately confirmed the downgrade policy: after failed-renewal grace,
existing records stay usable, with new additions blocked above Free limits. Do
not lock an arbitrary retained subset, archive excess records or revoke existing
staff just because usage exceeds a quota. This is the intended cutover behavior,
not evidence that the current raise-only entitlement overlay implements it.

The current source still preserves legacy/launch grants, uses a numeric product
cap where Pro requires unlimited, and skips most paid product admission caps.
Versioned signup/grant cutover and shared plan/admission parity must be completed
and checked before activation. Existing owner policy tests already establish
non-destructive quota projection; they do not substitute for the live admissions.

Paid Android release acceptance remains 1/8. Native source fixes are in
`69e8a5dc` and `f3c4d13c`; signed UI/purchase/coverage tests, legal/privacy and final
Data safety remain open. The unresolved location-provider choice from the safety
review is separate from payments-profile setup.

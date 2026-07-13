## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

None - can start immediately.

## Status

resolved

## Question

Which payment paths can the app realistically use for token purchases across iOS, Android, and Nigerian local banking flows such as OPay, while keeping merchants inside the app as much as platform rules allow?

Research at least:

- Current Apple App Store and Google Play policy constraints for selling consumable tokens used for digital image marketplace/refinement features.
- Whether local bank/fintech checkout can be offered in the mobile app for these token uses, or only for non-digital/merchant billing contexts.
- How existing `BillingCheckoutSession`, `BillingProviderEvent`, and `TenantSubscription` models could be reused or should remain separate from token top-ups.
- Recommended first provider path for MVP and fallback behavior after payment success, failure, cancellation, or delayed confirmation.

## Research Summary

Official policy references checked on 2026-07-13:

- Apple App Review Guidelines say apps with user-generated/creator content must follow in-app purchase rules, and subscriptions may include consumable credits. Apple also notes the guidelines are a living document. Source: https://developer.apple.com/app-store/review/guidelines/
- Google Play Payments policy requires Play billing for in-app features, digital content, virtual currencies, app functionality, and cloud software/services, except defined physical-goods/services and enrolled alternative-billing cases. Source: https://support.google.com/googleplay/android-developer/answer/9858738

## Resolution

- Treat image-marketplace tokens and AI refinement credits as digital in-app goods when bought inside iOS/Android apps.
- iOS MVP: use Apple in-app purchase for token packs if token buying is exposed in the App Store app. Do not route token top-ups to OPay/web checkout from iOS app UI unless a region/legal program explicitly allows the chosen flow and counsel approves it.
- Android MVP: use Google Play Billing for token packs in Play-distributed builds unless enrolled in an applicable alternative-billing/outside-app program for the target country. Do not default to local bank checkout for in-app digital token purchases.
- Web/dashboard can use normal provider checkout for tenant billing/top-ups because it is not App Store/Play in-app purchase UX.
- OPay/local banking is appropriate for merchant subscriptions, physical/order payments, or web dashboard token top-ups, not the default native mobile path for digital image tokens.
- Reuse `BillingCheckoutSession`/`BillingProviderEvent` concepts for normalized provider state, but keep token wallet ledger separate from tenant subscription state.
- Payment fallback: pending top-ups keep token actions blocked until confirmed; failure/cancel returns the merchant to the image/product draft; delayed confirmation shows pending credit and refresh/poll state; duplicate provider events must be idempotent.

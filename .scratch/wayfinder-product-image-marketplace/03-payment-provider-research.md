## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

None - can start immediately.

## Question

Which payment paths can the app realistically use for token purchases across iOS, Android, and Nigerian local banking flows such as OPay, while keeping merchants inside the app as much as platform rules allow?

Research at least:

- Current Apple App Store and Google Play policy constraints for selling consumable tokens used for digital image marketplace/refinement features.
- Whether local bank/fintech checkout can be offered in the mobile app for these token uses, or only for non-digital/merchant billing contexts.
- How existing `BillingCheckoutSession`, `BillingProviderEvent`, and `TenantSubscription` models could be reused or should remain separate from token top-ups.
- Recommended first provider path for MVP and fallback behavior after payment success, failure, cancellation, or delayed confirmation.

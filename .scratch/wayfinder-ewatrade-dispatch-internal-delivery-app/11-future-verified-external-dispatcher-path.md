## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

grilling

## Status

resolved

## Blocked by

- [Decide internal dispatcher onboarding and approval model](03-internal-dispatcher-onboarding-approval.md)
- [Decide dispatch job assignment and operations model](05-dispatch-job-assignment-operations.md)
- [Decide delivery pricing, fees, payment, and payout boundary](08-delivery-pricing-payment-payout.md)
- [Decide delivery proof, incident, and accountability controls](10-proof-incident-accountability.md)

## Question

What future path should Ewatrade preserve for external dispatch companies or independent riders to register, be verified, be approved, and receive delivery jobs without opening that marketplace in v1?

Resolve the staged rollout gates, minimum verification concepts, approved-provider lifecycle, business-versus-individual provider distinction, risk controls, and which database/API placeholders should exist now versus later.

## Resolution

- Preserve a staged path: internal riders -> approved external pilot providers -> verified courier companies -> limited independent riders -> broader marketplace only after dispute, payout, rating, and risk systems exist.
- External providers need profile type (`company` or `individual`), legal/contact details, service zones, vehicle/fleet details, verification documents, insurance where relevant, payout account, approval status, and suspension history.
- Provider lifecycle: draft, submitted, under review, approved, active, paused, suspended, rejected, removed.
- Keep schema/API placeholders for provider profile, verification status, service zones, assignment/bid linkage, and audit history. Defer self-serve onboarding UI, merchant provider choice, ratings, automated matching, and payouts.
- Risk controls before opening marketplace: manual approval, document review, zone limits, incident thresholds, payout holds, dispute process, proof requirements, and customer privacy boundaries.
- V1 internal dispatch should not pretend external dispatch is active; expose only admin-visible placeholders and implementation notes.

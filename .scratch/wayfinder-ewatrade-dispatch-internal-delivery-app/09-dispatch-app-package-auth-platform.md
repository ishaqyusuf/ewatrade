## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

grilling

## Status

resolved

## Blocked by

- [Decide Ewatrade Dispatch app identity and v1 product boundary](01-app-identity-v1-product-boundary.md)
- [Research current fulfillment bridge for Dispatch app reuse](02-current-fulfillment-bridge-research.md)
- [Decide internal dispatcher onboarding and approval model](03-internal-dispatcher-onboarding-approval.md)
- [Decide Dispatch mobile job lifecycle](06-dispatch-mobile-job-lifecycle.md)

## Question

How should the separate Ewatrade Dispatch mobile app be owned technically: app package boundary, auth/session model, workspace context, shared packages, API surface, build/deploy path, and relationship to the existing merchant mobile app?

Resolve what must be separate to avoid overloading the merchant app, what can be shared safely, and which technical decisions must be locked before implementation planning.

## Resolution

- Create a separate future app package, `apps/dispatch-mobile`, for the rider/dispatcher app. Do not add rider navigation into `apps/mobile`.
- Reuse shared packages for auth client helpers, API client, UI primitives where generic, notifications types, DB query types, and utility functions.
- Add a focused Dispatch API namespace rather than expanding `retailOps.*` for rider-only workflows. Merchant request creation can stay in merchant/domain routers and call shared delivery services.
- Auth uses platform user sessions plus dispatch-profile eligibility checks. A valid merchant membership is not required for riders.
- The app workspace context is "assigned rider profile/current operations region", not tenant/store switching.
- Build/deploy can follow Expo app patterns from `apps/mobile`, but bundle id, EAS project, env keys, update channel, icons, and release gates must be separate.
- Implementation planning must lock package name, session headers, dispatch API namespace, profile eligibility schema, and mobile release target before coding.

# ADR-0004: Keep Ewatrade Dispatch As A Separate Internal Rider App

## Status
Accepted

## Context
The delivery Wayfinder resolved whether delivery operations should live inside the merchant mobile app or a separate app. The v1 product must support internal, handpicked riders without opening a public dispatcher marketplace.

## Decision
- Name the rider/operations product Ewatrade Dispatch.
- Implement future rider workflows in a separate `apps/dispatch-mobile` package rather than adding rider navigation to the merchant Retail Ops app.
- Keep merchant delivery request creation in merchant/domain workflows, then hand off to shared delivery services and Dispatch APIs.
- Use invite-only approved rider profiles for v1.
- Keep bidding, public provider discovery, self-serve external dispatcher onboarding, automated matching, and rider payout automation out of v1.

## Consequences
- Merchant workflows stay focused on selling, service orders, and customer follow-up.
- Rider-specific release gates, auth eligibility, device controls, and offline status sync can evolve independently.
- Existing fulfillment primitives should be evolved carefully into the Dispatch boundary instead of being replaced by a disconnected model.

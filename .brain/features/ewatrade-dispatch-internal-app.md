# Ewatrade Dispatch Internal App

## Purpose
Define the resolved v1 boundary for Ewatrade Dispatch before implementation planning.

## Status
Wayfinder resolved. Implementation not started.

## Product Boundary
- The separate rider app is named **Ewatrade Dispatch**.
- V1 is internal-first: only handpicked, approved Ewatrade riders/dispatchers can use it.
- Merchant and customer surfaces may use "delivery" copy, but rider operations live outside the merchant mobile app.
- Future external dispatch companies and independent rider self-registration remain gated.

## V1 Operating Model
- Merchant workflows create delivery requests from Product Sales orders, Product Sales shared-link follow-up, Dry Cleaning/Laundry service orders, and future template orders through one delivery request boundary.
- Operations manually assigns, reassigns, cancels, and escalates delivery jobs.
- Riders use the Dispatch app for availability, assigned jobs, acknowledgement, pickup, in-transit/dropoff updates, proof, failed-delivery reports, and incident notes.
- Customer tracking uses opaque tokens and customer-safe status copy.

## Technical Direction
- Future implementation should create a separate `apps/dispatch-mobile` package.
- Reuse shared auth/API/UI/util packages where generic, but keep rider navigation out of `apps/mobile`.
- Add a focused Dispatch API namespace for rider-only workflows; merchant request creation can stay in merchant/domain APIs and call shared delivery services.
- Existing fulfillment primitives (`DeliveryRequest`, `DeliveryAssignment`, `DeliveryBid`, `TrackingEvent`, `DispatchProviderProfile`) should be reused or evolved rather than forked per business template.

## Deferred
- Exact Prisma migration sequence for rider profiles, source-polymorphic delivery requests, proof/incident records, tracking tokens, and dispatch device/session state.
- Operations console implementation.
- Expo/EAS bundle ids and release gates.
- Provider marketplace bidding, automated matching, distance pricing, rider payouts, and external self-serve onboarding.

## Source
- `.scratch/wayfinder-ewatrade-dispatch-internal-delivery-app/`

## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

grilling

## Status

resolved

## Blocked by

None - can start immediately.

## Question

How should v1 onboard and control access for handpicked dispatchers/riders: invitation, identity, verification, approval, active/suspended status, assigned service area, vehicle details, device/session controls, and admin review?

Resolve the minimum internal-only model that works now while preserving a later path to verified external dispatch businesses or independent riders.

## Resolution

- V1 onboarding is invite-only from an Ewatrade operations/admin surface.
- A dispatcher account is a platform `User` plus an internal dispatch profile, not a merchant tenant membership.
- Required profile fields: display name, phone, emergency/support contact, vehicle type, vehicle identifier where available, service-area labels, approval status, active/suspended status, and optional notes.
- Verification is manual in v1: operations staff record checked identity/vehicle documents as metadata or document references. Automated KYC and external-provider verification stay later.
- Approval states: `invited`, `profile_pending`, `approved`, `suspended`, `rejected`, `removed`.
- Availability is separate from approval. An approved rider can be unavailable/offline without being suspended.
- Device/session controls should record last app version, last seen time, active device id, and a revocation flag before a rider can receive jobs.
- Service areas should be coarse named zones in v1, not live polygon routing.
- Preserve future external provider support by keeping rider profiles distinct from `DispatchProviderProfile`; external courier companies can later own many riders after verification.

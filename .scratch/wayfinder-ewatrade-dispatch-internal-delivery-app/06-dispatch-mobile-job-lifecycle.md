## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

grilling

## Status

resolved

## Blocked by

- [Decide internal dispatcher onboarding and approval model](03-internal-dispatcher-onboarding-approval.md)
- [Decide dispatch job assignment and operations model](05-dispatch-job-assignment-operations.md)

## Question

What is the v1 Ewatrade Dispatch mobile workflow for an approved internal rider/dispatcher from login through availability, assigned jobs, acceptance/acknowledgement, pickup, in-transit updates, delivery completion, failed delivery, and issue reporting?

Resolve the statuses, required actions, proof requirements, offline/poor-network expectations, what the rider can edit, and what stays controlled by merchant/admin operations.

## Resolution

- Rider app flow: login, pass device/session eligibility, set availability, view assigned jobs, acknowledge job, navigate to pickup, mark arrived at pickup, collect pickup proof, mark picked up, navigate to dropoff, mark arrived at dropoff, collect delivery proof, mark delivered or failed.
- Delivery statuses: `open`, `assigned`, `acknowledged`, `pickup_arrived`, `picked_up`, `dropoff_arrived`, `delivered`, `failed`, `cancelled`, `escalated`.
- Rider-editable fields are limited to status updates, proof metadata, notes, incident reports, and optional location at event time.
- Merchant/admin-controlled fields: source order, customer identity, pickup/dropoff addresses, fee responsibility, assignment, cancellation after pickup, refund/settlement decisions, and final incident resolution.
- Poor-network behavior: queue rider status/proof events locally with idempotency keys and show unsynced state. Do not allow accepting new assignments without a recent server session.
- Required proof: pickup confirmation and delivery confirmation. Photo, signature, recipient name, and OTP can be configured per workflow, with photo plus recipient name as the v1 default for higher-risk jobs.

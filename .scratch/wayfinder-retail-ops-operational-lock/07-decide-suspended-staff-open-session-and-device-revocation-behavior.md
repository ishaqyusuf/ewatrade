# 07 - Decide Suspended-Staff, Open-Session, And Device-Revocation Behavior

## Parent map

[Wayfinder: Retail Ops Operational Lock](map.md)

## Type

grilling

## Status

ready-for-agent

## Blocked by

01 - Define Operational-Lock Scope And Language; 02 - Audit Current Retail Ops Write Surfaces And Offline Events

## Question

What should happen when an admin suspends a sales rep who may already be clocked in, offline, holding assigned stock, or carrying queued events?

## Resolve By

- Decide whether suspension immediately blocks new local work, sync replay, both, or only future server writes after refresh.
- Decide how suspension interacts with open rep sessions and closeout: force closeout, allow closeout only, block closeout, or require admin review.
- Decide whether suspension should also revoke or freeze the rep's offline device registrations.
- Decide how assigned stock wallets and custody balances are displayed while a rep is suspended.
- Decide whether queued events created before suspension can sync, become conflicts, or require admin review.
- Decide what the suspended rep can still read or export locally.
- Decide whether owner/admin users can suspend managers, and which roles remain outside this feature.

## Context

Current staff status updates can suspend or reactivate cashier/operator/manager memberships, and staff status is mirrored into durable staff profile/lifecycle rows when available. Offline device registration and revocation already exist separately. This ticket should decide whether operational lock work should connect those concepts or keep them separate with a shared effective-access check.

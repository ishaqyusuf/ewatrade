# 01 - Define Operational-Lock Scope And Language

## Parent map

[Wayfinder: Retail Ops Operational Lock](map.md)

## Type

grilling

## Status

ready-for-agent

## Question

What exactly does "lock", "disable", or "business closed" mean in the Retail Ops domain?

Decide the canonical user-facing and implementation language, the actors affected, and the broad operation groups that should become read-only when a business or store is closed. Distinguish the business/store operational lock from staff suspension, subscription entitlement blocking, offline-device revocation, and ordinary role permissions.

## Resolve By

- Decide the canonical term used in product copy and code comments/specs.
- Decide whether "closed" means sales reps cannot create any new operational events, or only cannot create sales/orders.
- Decide whether owner/admin/manager users are blocked, warned, or allowed to override specific workflows while locked.
- Decide which surfaces must keep read-only access during a lock, such as product lists, assigned stock, customer lookup, reports, sync status, and account/settings.
- Decide the user-facing mental model for manual closure, scheduled closure, and staff suspension.

## Context

The requester described a lock or disable feature where admins can set closed times, manually close the business, reopen it later, and suspend sales reps. When closed, sales reps should not manipulate anything on the site or submit orders, and offline reps should still be blocked through locally cached settings.

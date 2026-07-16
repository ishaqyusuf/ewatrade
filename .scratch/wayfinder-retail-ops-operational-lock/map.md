# Wayfinder: Retail Ops Operational Lock

## Destination

Create a ready-for-agent product and implementation blueprint for a Retail Ops operational lock feature. The way is clear when the team can specify how admins manually close a business or store, define scheduled closure windows, suspend sales reps, cache the effective lock state locally, and block sales-rep operational writes both online and offline without guessing.

This map is planning only. It should resolve decisions and prepare implementation tickets, not change product code.

## Notes

- Use this scratch directory: `.scratch/wayfinder-retail-ops-operational-lock/`.
- Canonical working term: `operational lock`. This covers manual business/store closure, scheduled closure windows, and the effective read-only state sales reps experience when they are not allowed to operate.
- Related but distinct term: `staff suspension`. Existing Retail Ops staff management already supports invited, active, and suspended staff. This effort must decide how suspension interacts with operational locks and offline device access.
- Primary product surfaces: `apps/mobile` for owner/admin and sales-rep workflows, `apps/api` tRPC Retail Ops routers for protected mutation enforcement, and dashboard bridge routes where admin controls may also appear.
- Current foundation already includes role-aware Retail Ops permissions, staff status updates, rep sessions, sale creation, stock intake/adjustment/conversion, closeout, share links, offline event envelopes, durable offline devices, sync history, and sync conflicts.
- Offline behavior is first-class: after a user has logged in once, the mobile app can queue Retail Ops events locally. This feature must decide how a locally cached lock snapshot prevents forbidden queueing while offline and how server sync rejects stale/off-policy events.
- The requester wants admins to be able to set business closed times, manually close and reopen the business, and suspend sales reps. When closed, sales reps should not manipulate the site or submit orders until the business is open again.
- Relevant Brain docs: `.brain/features/mobile-retail-ops-mvp-spec.md`, `.brain/features/retail-ops-sales-product.md`, `.brain/api/endpoints.md`, `.brain/api/permissions.md`, `.brain/database/schema.md`, `.brain/database/relationships.md`, and `.brain/system/architecture.md`.

## Tickets

- [ ] [Define operational-lock scope and language](01-define-operational-lock-scope-and-language.md)
- [ ] [Audit current Retail Ops write surfaces and offline events](02-audit-current-retail-ops-write-surfaces-and-offline-events.md)
- [ ] [Decide lock authority, scheduling, precedence, and time-zone rules](03-decide-lock-authority-scheduling-precedence-and-time-zone-rules.md)
- [ ] [Decide local cache, offline enforcement, and stale-state behavior](04-decide-local-cache-offline-enforcement-and-stale-state-behavior.md)
- [ ] [Decide schema, API contracts, permissions, and audit trail](05-decide-schema-api-contracts-permissions-and-audit-trail.md)
- [ ] [Prototype admin controls and sales-rep blocked states](06-prototype-admin-controls-and-sales-rep-blocked-states.md)
- [ ] [Decide suspended-staff, open-session, and device-revocation behavior](07-decide-suspended-staff-open-session-and-device-revocation-behavior.md)
- [ ] [Assemble final implementation spec, ticket set, and QA gates](08-assemble-final-implementation-spec-ticket-set-and-qa-gates.md)

## Decisions so far

No tickets have been resolved yet. The initial map accepts the user's direction that business closure and sales-rep suspension must prevent sales-rep operational writes even when the sales rep is offline.

## Not yet specified

- Exact set of operations blocked by an operational lock: sale creation, shared-link order follow-up, stock intake, adjustment, conversion, staff invite, product edit, session open, session close, closeout, customer upsert, link creation/deactivation, and dry-cleaning operations.
- Whether an admin closure applies to an entire tenant/business, one store, selected stores, or both levels.
- Whether admins and managers can still perform selected emergency writes while the business is locked.
- Recurring schedule rules, one-off holiday closures, overnight windows, time-zone ownership, and daylight-saving behavior.
- Exact stale-cache policy when a rep has been offline for a long time and the latest server lock state cannot be fetched.
- Exact server conflict/error codes when queued offline events were created before a lock but replay after the business became closed.
- Exact UI placement for admin controls in mobile and dashboard, and the sales-rep blocked-state copy.
- Exact implementation ticket breakdown after the decisions are resolved.

## Out of scope

- Implementing the operational lock feature inside this Wayfinder map.
- Replacing the broader Retail Ops permission, subscription, staff, sync, or offline-device architecture.
- Final payroll, attendance, GPS, or geofenced clock-in rules.
- Provider-native push notifications, SMS alerts, or realtime websocket delivery for lock changes unless a later ticket proves the lock spec cannot proceed without a narrow notification decision.
- Full multi-location inventory transfer rules beyond whatever is needed to define tenant/store lock scope.

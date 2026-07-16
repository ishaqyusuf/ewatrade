# 02 - Audit Current Retail Ops Write Surfaces And Offline Events

## Parent map

[Wayfinder: Retail Ops Operational Lock](map.md)

## Type

research

## Status

ready-for-agent

## Question

Which existing Retail Ops write paths, mobile local-store actions, offline sync event types, dashboard bridge routes, and public/protected API procedures must consult an operational lock before accepting work?

## Resolve By

- Inventory every protected Retail Ops mutation in `apps/api/src/trpc/routers/retail-ops*.ts` and every dashboard bridge route that writes Retail Ops data.
- Inventory every local mobile action in `apps/mobile/src/store/retailOpsStore.ts` that creates or changes persisted operational state while offline.
- Inventory every offline event type built in `apps/mobile/src/lib/retail-ops-sync.ts` and replayed by `retailOps.syncEvents`.
- Identify public customer-facing flows, such as shared product order requests, that may need different lock behavior from staff/admin protected flows.
- Produce a short write-surface matrix that groups actions by always blocked, conditionally allowed, admin override, or out of scope.

## Context

Current foundations include sale creation, credit repayment, product setup, stock intake, stock adjustment, unit conversion, rep session open, closeout, customer upsert, staff invite, share-link creation/deactivation, shared-link follow-up, delivery request updates, dry-cleaning operations, and offline sync replay. The lock spec should avoid one-off UI-only blocking by identifying every authoritative server and offline queue path.

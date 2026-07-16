# 04 - Decide Local Cache, Offline Enforcement, And Stale-State Behavior

## Parent map

[Wayfinder: Retail Ops Operational Lock](map.md)

## Type

grilling

## Status

ready-for-agent

## Blocked by

01 - Define Operational-Lock Scope And Language; 02 - Audit Current Retail Ops Write Surfaces And Offline Events; 03 - Decide Lock Authority, Scheduling, Precedence, And Time-Zone Rules

## Question

What operational-lock snapshot should be cached locally, and how should the mobile app behave when that snapshot is stale or unavailable offline?

## Resolve By

- Decide the local snapshot fields: tenant/store ids, effective status, reasons, schedule windows, version, fetched-at time, expiry/staleness markers, actor-facing message, and staff/device eligibility.
- Decide whether the app fails closed or allows limited work when no lock snapshot has ever been fetched.
- Decide whether a snapshot expires after a maximum offline duration.
- Decide how sales reps see the lock while offline and which read-only surfaces remain available.
- Decide whether events created while open can still sync if replay happens after a later closure, and which cases become server conflicts.
- Decide whether local queued events should include the lock policy version/effective-open proof they were created under.
- Decide refresh triggers: login, app foreground, business switch, store switch, sync attempt, lock settings screen open, and periodic background checks where available.

## Context

The mobile store uses persisted local Retail Ops state and queues sync events after first login. Existing sync events carry tenant/business id, store id, actor/device metadata, dependencies, status, retry state, and event ids. Server sync already records applied, failed, skipped, and conflict outcomes.

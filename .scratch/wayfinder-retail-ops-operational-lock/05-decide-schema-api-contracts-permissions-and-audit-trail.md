# 05 - Decide Schema, API Contracts, Permissions, And Audit Trail

## Parent map

[Wayfinder: Retail Ops Operational Lock](map.md)

## Type

research

## Status

ready-for-agent

## Blocked by

02 - Audit Current Retail Ops Write Surfaces And Offline Events; 03 - Decide Lock Authority, Scheduling, Precedence, And Time-Zone Rules; 04 - Decide Local Cache, Offline Enforcement, And Stale-State Behavior

## Question

What backend model, tRPC/API contracts, permission checks, sync replay checks, and audit trail are required for operational locks?

## Resolve By

- Decide whether the first implementation uses new durable Prisma models, tenant/store metadata fallback, or both during rollout.
- Define read contracts for effective lock state and admin lock settings.
- Define mutation contracts for manual close, reopen, schedule create/update/delete, and possibly staff suspension integration.
- Decide which role permissions can read, manage, override, or only observe lock state.
- Decide how every protected Retail Ops write path receives or resolves the effective lock check.
- Decide server error codes and conflict payloads for blocked online writes and stale offline replay.
- Decide audit records for manual closures, reopen actions, schedule edits, blocked attempts, and override attempts.
- Decide required Brain doc updates for schema, API endpoints/contracts, permissions, and feature docs.

## Context

Prisma is the source of truth for schema. Runtime logic should stay behind services/repositories rather than UI components. Retail Ops APIs already enforce tenant, role, store, entitlement, device, and staff checks at protected procedure boundaries, and sync replay is the authoritative server gate for offline events.

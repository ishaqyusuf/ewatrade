# 03 - Decide Lock Authority, Scheduling, Precedence, And Time-Zone Rules

## Parent map

[Wayfinder: Retail Ops Operational Lock](map.md)

## Type

grilling

## Status

ready-for-agent

## Blocked by

01 - Define Operational-Lock Scope And Language

## Question

How should admins define lock state, schedules, manual closures, reopen behavior, precedence, and time zones?

## Resolve By

- Decide whether lock state lives at tenant/business level, store level, or both.
- Decide whether manual closure always overrides the schedule until explicitly reopened.
- Decide whether schedules are recurring weekly windows, one-off closure windows, holiday exceptions, or a smaller MVP subset.
- Decide how overnight closures are represented.
- Decide which time zone owns schedule evaluation: tenant, store, device, or server default.
- Decide how manual closures, scheduled closures, staff suspension, subscription blocking, and offline-device revocation combine into one effective allowed/blocked state.
- Decide whether lock changes should record reason, actor, created time, start/end time, and optional note.

## Context

Retail Ops is multi-tenant and store-aware. Current API procedures resolve tenant membership and store scope before reads/writes. Store metadata already carries first-phase Retail Ops setup data, while durable tenant/store tables and migrations are available for longer-lived operational features.

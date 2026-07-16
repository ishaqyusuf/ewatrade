# 08 - Assemble Final Implementation Spec, Ticket Set, And QA Gates

## Parent map

[Wayfinder: Retail Ops Operational Lock](map.md)

## Type

task

## Status

ready-for-agent

## Blocked by

01 - Define Operational-Lock Scope And Language; 02 - Audit Current Retail Ops Write Surfaces And Offline Events; 03 - Decide Lock Authority, Scheduling, Precedence, And Time-Zone Rules; 04 - Decide Local Cache, Offline Enforcement, And Stale-State Behavior; 05 - Decide Schema, API Contracts, Permissions, And Audit Trail; 06 - Prototype Admin Controls And Sales-Rep Blocked States; 07 - Decide Suspended-Staff, Open-Session, And Device-Revocation Behavior

## Question

Once the lock decisions are resolved, what is the final ready-for-agent spec, implementation ticket set, and QA plan?

## Resolve By

- Write a concise implementation spec that links back to each resolved decision instead of duplicating long reasoning.
- Split implementation into tracer-bullet tickets with blockers, starting from schema/API policy and ending with UI and QA.
- Include test expectations for domain services, tRPC procedures, sync replay, local mobile store guards, offline stale-cache behavior, and role/permission cases.
- Include manual QA paths for admin manual close/reopen, scheduled closure, sales-rep offline lock cache, staff suspension, stale replay conflict, and reopen recovery.
- List required Brain documentation updates for the implementation phase.

## Context

Wayfinder planning stops when the implementation path is clear. This ticket should prepare the handoff, not implement the feature.

# 06 - Prototype Admin Controls And Sales-Rep Blocked States

## Parent map

[Wayfinder: Retail Ops Operational Lock](map.md)

## Type

prototype

## Status

ready-for-agent

## Blocked by

01 - Define Operational-Lock Scope And Language; 03 - Decide Lock Authority, Scheduling, Precedence, And Time-Zone Rules; 04 - Decide Local Cache, Offline Enforcement, And Stale-State Behavior

## Question

What should admins and sales reps see when creating, managing, or being blocked by an operational lock?

Prototype a rough interaction blueprint for mobile and dashboard surfaces before implementation tickets are written.

## Resolve By

- Decide where admin lock controls live in mobile and dashboard settings or operations.
- Sketch manual close/reopen actions, reason/note capture, current status display, and schedule management.
- Sketch sales-rep blocked states for home, create-sale, stock, share-link, session, closeout, and offline sync surfaces.
- Decide whether blocked action buttons disappear, become disabled with explanation, or open a read-only explanation sheet.
- Decide status-banner language for online lock, offline cached lock, stale cache, suspended staff, and server-rejected replay conflicts.
- Decide whether admins receive a preview of which reps/devices are currently blocked or stale.

## Context

Mobile UI should remain NativeWind-first, flat, keyboard-safe, and aligned with the existing Retail Ops design-system primitives such as status banners, sheets, role-aware home screens, sync status, and full-screen modals for longer workflows.

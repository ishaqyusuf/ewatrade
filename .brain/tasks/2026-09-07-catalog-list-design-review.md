# Task: EWA-BIZ-005 Catalog list design review

## Status

Owner Review

## Canonical Ticket

[Catalog list review package](../../.scratch/mobile-architecture-hardening-and-feature-completion/designs/entry-13-catalog-list-rich-directions/README.md)

## Created Date

2026-09-07

## Last Updated

2026-09-07

## Current Gate

The current Catalog list behavior is source-audited. Five responsive Light/Dark
directions are ready with previous/next navigation and switchable populated,
first-item, and Add-item states. Option A, `Market Stockbook`, is recommended.
Production implementation must pause until the owner explicitly selects a
direction.

## Boundaries

- Preserve Product versus Service semantics, pagination, filters, search,
  refresh, offline behavior, and the business dock.
- Preserve the existing routes into first Product/Service setup and Catalog item
  detail.
- Include the directly opened Add-item choice surface in this batch.
- Keep the full Catalog item edit screen in its dedicated `EWA-BIZ-006` batch.
- Do not change API, database, auth, permission, provider, or production data.

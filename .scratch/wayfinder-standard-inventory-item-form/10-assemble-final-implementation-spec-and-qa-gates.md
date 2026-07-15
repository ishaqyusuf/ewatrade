# 10 - Assemble Final Implementation Spec And QA Gates

## Question

How should the resolved decisions become a handoff-ready implementation spec with file-level phases, acceptance criteria, and QA gates?

**Type:** Task.

**Blocked by:** [Decide item form field order and disclosure pattern](01-decide-item-form-field-order-and-disclosure-pattern.md); [Decide description and product image entry behavior](02-decide-description-and-product-image-entry-behavior.md); [Decide product, unit, variant, and sellable option language](03-decide-product-unit-variant-and-sellable-option-language.md); [Design variant type search and creation modal](04-design-variant-type-search-and-creation-modal.md); [Design variant values editor](05-design-variant-values-editor.md); [Decide variant price, stock, enable, and expansion matrix](06-decide-variant-price-stock-enable-and-expansion-matrix.md); [Decide default unit and unit suggestion behavior](07-decide-default-unit-and-unit-suggestion-behavior.md); [Decide suggestion library governance and privacy rules](08-decide-suggestion-library-governance-and-privacy-rules.md); [Decide API, schema, offline sync, and migration impact](09-decide-api-schema-offline-sync-and-migration-impact.md).

## Resolve By

- Assemble the final product spec for Add/Edit Item across first-product onboarding and later catalog management.
- Produce the file-level implementation sequence for mobile UI, local state/offline replay, API contracts, query modules, schema/migrations if needed, tests, and Brain documentation updates.
- Define acceptance criteria for simple items, items with one variant dimension, items with multiple dimensions if included, service-style items, feed/unit examples, dry-cleaning examples, image links, optional descriptions, and edit flows.
- Define required QA commands, mobile emulator/manual paths, accessibility checks, keyboard checks, dark/light mode checks, long-list virtualization checks, and regression coverage for sale/stock/share-link/report compatibility.
- Name follow-up items that should remain outside the first implementation.

## Context

This ticket should not start until the decision trail is complete. Its output is the artifact a lower agent can implement from without re-litigating the item form behavior.

## Resolution

Implemented directly in this checkout. QA gates are encoded in focused schema/store/sync/query tests, `apps/mobile/scripts/check-first-product-flow.mjs`, mobile TypeScript, API TypeScript, DB TypeScript, Brain updates, and emulator validation.

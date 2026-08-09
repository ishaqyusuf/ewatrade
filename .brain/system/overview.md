# System Overview

## Purpose
Operational summary of the platform and how its major domains fit together.

## How To Use
- Update when the business scope or system boundary changes.
- Keep this aligned with `.brain/SYSTEM_OVERVIEW.md`.

## Platform Shape
- Project name: `ewatrade`.
- Multi-tenant commerce platform for merchants and dispatch providers.
- Customer-facing experiences include storefronts, checkout, and delivery tracking.
- Internal experiences include merchant operations, POS workflows, and logistics coordination.
- Product and Service Catalog Items share Sellable Variants, Offerings and
  Commercial Orders while retaining separate inventory and work semantics.
- Inventory uses exact versioned units, explicit balance sources and an
  immutable operation ledger.
- Saved Customers are tenant-scoped and merge with immutable customer facts
  captured on Commercial Orders.
- Tenant owners/admins control offline checkout and optional staff-record
  approval. The offline mutation boundary is one new Commercial Order with an
  optional initial payment and customer snapshot; replay stages eligible staff
  work or applies it directly. Catalog, inventory, Staff and Service mutations
  remain online-only.
- Service work uses Intake, Jobs/Job Lines, assignments, due commitments,
  evidence, Requests, versioned Quotes and scoped customer tracking.
- Service Commerce is the approved capability direction for channel-neutral
  customer requests, Quotes, bookings, payments, pickup/delivery and service
  completion. It composes existing bounded contexts and retains typed vertical
  source aggregates plus one narrow Commerce Inquiry rather than introducing a
  universal request model. Progressive Catalog lets verified requests create
  private draft Catalog records and attributable price history before managed
  inventory; Pharmacy remains a thin regulated source/policy extension of the
  shared workspace.
- Managed storefront domains separate quote/payment/registrar state from
  ownership/DNS/SSL connection state and preserve the free platform hostname.

## Major Domains
- Merchant system
- Catalog and Offerings
- Inventory and stock operations
- Commercial Orders
- Service Operations and Customer Access
- Website builder
- Managed storefront domains
- Marketplace
- Dispatch network
- POS cashier
- Self-service checkout
- WhatsApp commerce
- Service Commerce
- Pharmacy Commerce vertical

## Source Docs
- `.brain/modules/*.md`
- `.brain/workflows/order-delivery-flow.md`
- `.brain/architecture/multi-tenant.md`
- `.brain/features/service-commerce.md`

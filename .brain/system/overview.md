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
- Service work uses Intake, Jobs/Job Lines, assignments, due commitments,
  evidence, Requests, versioned Quotes and scoped customer tracking.

## Major Domains
- Merchant system
- Catalog and Offerings
- Inventory and stock operations
- Commercial Orders
- Service Operations and Customer Access
- Website builder
- Marketplace
- Dispatch network
- POS cashier
- Self-service checkout
- WhatsApp commerce

## Source Docs
- `.brain/modules/*.md`
- `.brain/workflows/order-delivery-flow.md`
- `.brain/architecture/multi-tenant.md`

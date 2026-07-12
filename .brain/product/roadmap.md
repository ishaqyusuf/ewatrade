# Product Roadmap

## Purpose
Track major product milestones and planned sequencing.

## How To Use
- Keep this aligned with `.brain/tasks/roadmap.md`.

## Near Term
- Establish monorepo structure for web, mobile, API, and shared packages.
- Finalize database engine choice under Prisma-managed schema.
- Define core merchant, catalog, order, and tenant models.
- Implement baseline auth and tenant isolation flows.
- Ship Retail Ops/Sales as the first product wedge: sign-up, first product, flexible units with durable price-history schema, sales, customer book with durable schema foundation, staff invites with durable profile/audit schema, staff stock wallet custody, offline sync with durable schema foundation, rep sessions, durable closeout schema foundation, reports, share links, and subscription surfaces.
- Establish Retail Ops subscription packaging with Starter, Growth, and Pro tiers, production subscription snapshots, durable subscription schema foundation, and business-scoped entitlement checks.

## Mid Term
- Build website builder primitives and merchant storefront flows.
- Build dispatch network workflows and delivery assignment.
- Add marketplace listing and discovery.
- Add POS cashier and self-service checkout flows.
- Integrate billing provider checkout, webhooks, renewal state, and upgrade/downgrade handling behind a billing service boundary.

## Long Term
- Expand analytics, automation, and AI-assisted merchant tooling.
- Deepen WhatsApp commerce and support workflows.

## Product Wedge Notes
- Retail Ops starts with flexible-unit inventory businesses. Feed/grain examples are templates for the unit and reconciliation model, not a narrow vertical boundary.
- The full stock-to-closeout workflow is documented in `.brain/workflows/retail-ops-stock-to-closeout-flow.md`.

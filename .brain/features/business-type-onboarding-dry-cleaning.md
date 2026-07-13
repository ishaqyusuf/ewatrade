# Business Type Onboarding And Dry Cleaning

## Purpose
Add a v1 business-template layer so new stores can start as Product Sales, Dry Cleaning / Laundry, or Other business without weakening the existing Retail Ops product-sales flow.

## Current Phase
Implemented as a metadata-backed v1 in the main Retail Ops stack:

- `Product Sales` remains the default effective template for stores without explicit template metadata.
- `Dry Cleaning / Laundry` enables service items, service orders, service request links, request conversion, customer tracking tokens, notification intents, and operational reports.
- `Other business` captures raw unsupported-business demand in onboarding metadata and completed onboarding sessions so internal tooling can rank requested templates.
- Dashboard first-store setup now presents the three v1 outcomes and submits template-specific setup answers.
- Protected tRPC procedures under `retailOps` expose template reads/updates plus dry-cleaning catalog, order, request, and report operations.
- Public tRPC procedures resolve dry-cleaning service-request links, submit public service requests, and resolve opaque tracking tokens.

## Data Model
No Prisma schema migration was added in this phase.

- `Store.metadata.retailOps.businessTemplate` stores the effective template key, label, source, and selected timestamp.
- `Store.metadata.retailOps.onboarding` stores the cleaned setup answers and selected template snapshot.
- `Store.metadata.retailOps.dryCleaning` stores bounded service items, service orders, request links, service requests, and notification intents.
- `Store.metadata.retailOps.businessTemplateChanges` stores bounded template-change audit entries.
- Completed `OnboardingSession.formData.onboarding` stores the same template/setup snapshot for analytics and support review.

## Product Rules
- Product Sales inventory, stock wallets, share links, sales, sessions, and reports must continue to use their existing Product/Order/Inventory tables and behavior.
- Dry-cleaning service catalog entries are service items, not inventory products. Creating service orders must not deduct Product Sales stock or staff wallet balances.
- Service-order lines snapshot service name, variant, price, quantity, and total so later price edits do not rewrite historical orders.
- Ready and delay status updates can create manual notification intents with customer-facing fallback copy.
- Public service-request and tracking flows use opaque tokens, not raw database ids.
- Template changes are owner/admin-only at the API layer and are blocked by default when products, orders, or dry-cleaning operational records already exist.

## Deferred
- Dedicated Prisma tables for dry-cleaning service catalog, service orders, requests, notifications, and unsupported-business demand signals.
- Merchant-facing dry-cleaning order-management screens beyond setup selection.
- Provider-native WhatsApp/SMS delivery for dry-cleaning notification intents.
- Rich internal admin UI for unsupported-business ranking; v1 exposes an internal procedure for ranked demand.
- Unified customer dashboard across Product Sales and service orders.

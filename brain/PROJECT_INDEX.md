# Project Index

Project: `ewatrade`

## Applications
- `apps/web` - Next.js App Router web application scaffold for the ewatrade frontend.

## Packages
- `packages/ui` - Shared UI package that owns the Tailwind CSS entrypoint and shared styling tokens.
- `packages/utils` - Shared utility package for cross-app helper functions.
- `packages/tsconfig` - Shared TypeScript base configs for apps and packages.

## Services
- None detected.

## Core Modules
- `brain/modules/merchant-system.md` - Merchant onboarding, stores, catalog, inventory, and order operations.
- `brain/modules/website-builder.md` - Section-based storefront/page builder with themes and templates.
- `brain/modules/marketplace.md` - Optional public marketplace for merchant product discovery.
- `brain/modules/dispatch-network.md` - Dispatch/rider/courier network with zones, bidding, and reputation.
- `brain/modules/pos-cashier.md` - Physical-store cashier, barcode, receipt, and stock deduction workflows.
- `brain/modules/self-service-checkout.md` - Assisted self-checkout state machine for in-store customer flows.
- `brain/modules/whatsapp-commerce.md` - Messaging-based order updates, conversation history, and AI assistance.

## Important Files
- `brain/BRAIN.md` - Project Brain entry point.
- `brain/SYSTEM_OVERVIEW.md` - Platform summary and current technical direction.
- `brain/AI_WORKFLOW.md` - Rules for using Brain docs during delivery work.
- `brain/AI_PROMPT_RULES.md` - Prompting and documentation hygiene rules for AI collaborators.
- `brain/architecture/system-architecture.md` - Legacy architecture summary retained for continuity.
- `brain/architecture/multi-tenant.md` - Tenant isolation rules.

## TODO
- Add `apps/mobile` when the Expo client is created.
- Add `apps/api` and database/auth packages when backend scaffolding begins.

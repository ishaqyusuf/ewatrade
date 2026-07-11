# Retail Ops Onboarding

## Purpose
Give new owners a lightweight path from signup to first usable Retail Ops workspace without making setup feel like a long questionnaire.

## Current Phase
Marketing signup creates the tenant/business and stores owner, country, currency, industry, and business-size context. Dashboard first-store setup now captures the production Retail Ops setup profile before the owner starts adding inventory:

- store name
- business type
- country and currency
- main product category
- sales method
- team size
- optional support email

`POST /api/stores` and protected tRPC `tenant.createStore` accept the same onboarding payload. Both paths call `createTenantStore`, which stores cleaned values in `Store.metadata.retailOps.onboarding` with source, captured timestamp, and currency code, then writes a completed `OnboardingSession` for the tenant/user with the created store snapshot and the same setup payload. This keeps first-store setup reusable for dashboard and API clients while preserving a durable setup-completion record.

## Product Rules
- Keep first-run setup compact and operational.
- Do not hard-code feed, grain, or any other case-study product as the product identity.
- Store onboarding values by tenant/store scope so multiple businesses and stores remain isolated.
- Keep the shared DB helper as the write path for dashboard and tRPC store creation.
- Treat store metadata plus completed `OnboardingSession` persistence as the current bridge, not the final analytics or setup-state system.

## Deferred
- Multi-step setup-completion state beyond the first completed store setup session.
- First-product setup branching based on product category or sales method.
- Reusable starter templates for units, variants, and stock setup.
- Onboarding analytics, drop-off reporting, and admin review tools.
- Manual browser validation of the full signup -> first store -> first product path.

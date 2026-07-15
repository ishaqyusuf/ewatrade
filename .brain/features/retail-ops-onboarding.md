# Retail Ops Onboarding

## Purpose
Give new owners a lightweight path from signup to first usable Retail Ops workspace without making setup feel like a long questionnaire.

## Current Phase
Marketing signup creates the tenant/business and stores owner, country, currency, industry, and business-size context. Dashboard first-store setup now captures the production Retail Ops setup profile before the owner starts operating:

Early-access signup can now start from a secure marketing access link. The early-access route creates an expiring one-time `OnboardingSession`; `/signup?access_token=...` verifies it, prefills the owner/business fields that came from the lead, and `POST /api/auth/signup` consumes that session exactly once while linking it to the created tenant and owner.

Local signup uses tenant-specific local surface hostnames such as `<tenant>-storefront.localhost`, `<tenant>-pos.localhost`, and `<tenant>-dashboard.localhost` for DB hostname records. Production keeps the public `<tenant>.ewatrade.com`, `<tenant>-pos.ewatrade.com`, and `<tenant>-dashboard.ewatrade.com` shape.

- store name
- business template: Product Sales, Dry Cleaning / Laundry, or Other business
- country and currency
- template-specific category or raw business description
- sales method
- team size
- optional support email

Marketing signup dispatches the welcome email through `@ewatrade/email` after tenant creation. The signup response includes `emailDeliveryStatus` so the success UI can distinguish a sent confirmation from a provider failure instead of claiming delivery unconditionally.

`POST /api/stores` and protected tRPC `tenant.createStore` accept the same onboarding payload. Both paths call `createTenantStore`, which stores cleaned values in `Store.metadata.retailOps.onboarding` with source, captured timestamp, currency code, and the effective business-template snapshot. It also writes `Store.metadata.retailOps.businessTemplate` and a completed `OnboardingSession` for the tenant/user with the created store snapshot and the same setup payload. This keeps first-store setup reusable for dashboard and API clients while preserving a durable setup-completion record.

Dry Cleaning / Laundry stores also receive an empty metadata-backed dry-cleaning workspace under `Store.metadata.retailOps.dryCleaning`. Other business submissions store unsupported-demand metadata that the internal ranking procedure can aggregate from completed onboarding sessions.

## Product Rules
- Keep first-run setup compact and operational.
- Do not hard-code feed, grain, or any other case-study product as the product identity.
- Existing stores without template metadata resolve to Product Sales.
- Store onboarding values by tenant/store scope so multiple businesses and stores remain isolated.
- Keep the shared DB helper as the write path for dashboard and tRPC store creation.
- Treat store metadata plus completed `OnboardingSession` persistence as the current bridge, not the final analytics or setup-state system.

## Deferred
- Multi-step setup-completion state beyond the first completed store setup session.
- Dedicated setup screens after the first business-template selection.
- Reusable starter templates for units, variants, and stock setup.
- Onboarding analytics, drop-off reporting, and admin review tools.
- Manual browser validation of the full signup -> first store -> first product path.

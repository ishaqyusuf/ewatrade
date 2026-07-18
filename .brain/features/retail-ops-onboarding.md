# Retail Ops Onboarding

## Purpose
Give new owners a lightweight path from signup to first usable Retail Ops workspace without making setup feel like a long questionnaire.

## Current Phase
Marketing signup creates the tenant/business and first store, and stores owner,
country, operating currency, industry, and business-size context. Operating
currency is required in marketing and mobile owner signup, suggested from the
selected country, and manually overridable. The supported launch set is NGN,
USD, GHS, KES, ZAR, and EGP.

Dashboard first-store setup now captures the production Retail Ops setup profile
before the owner starts operating:

Early-access signup can now start from a secure marketing access link. The early-access route creates an expiring one-time `OnboardingSession`; `/signup?access_token=...` verifies it, prefills the owner/business fields that came from the lead, and `POST /api/auth/signup` consumes that session exactly once while linking it to the created tenant and owner.

The chosen business slug reserves the future public storefront address:
`<tenant>.ewatrade.com` in production. Signup may also retain a tenant-specific
POS hostname, but it never creates a tenant-specific dashboard hostname. Every
business uses the shared dashboard at `dashboard.ewatrade.com` in production or
`ewatrade-dashboard.localhost` in local development; active business context is
resolved from the authenticated membership and active-tenant cookie.

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
- Treat the chosen subdomain as storefront identity, never as a dashboard host.
- Do not hard-code feed, grain, or any other case-study product as the product identity.
- Existing stores without template metadata resolve to Product Sales.
- Store onboarding values by tenant/store scope so multiple businesses and stores remain isolated.
- Treat `Store.currencyCode` as the commerce source of truth. Tenant currency is
  the default for a newly created store; missing legacy values fall back to NGN.
- Render the selected currency symbol on every money field and display. Unknown
  legacy codes render as the code instead of an incorrect symbol.
- Currency changes after transactions, exchange conversion, and historical
  repricing are outside first-run onboarding.
- Keep the shared DB helper as the write path for dashboard and tRPC store creation.
- Treat store metadata plus completed `OnboardingSession` persistence as the current bridge, not the final analytics or setup-state system.

## Deferred
- Multi-step setup-completion state beyond the first completed store setup session.
- Dedicated setup screens after the first business-template selection.
- Reusable starter templates for units, variants, and stock setup.
- Onboarding analytics, drop-off reporting, and admin review tools.
- Manual browser validation of the full signup -> first store -> first product path.

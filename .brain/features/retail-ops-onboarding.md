# Business Onboarding

## Purpose
Give new owners a lightweight path from signup to a usable generic operations
workspace without making setup feel like a long questionnaire or choosing an
industry workflow.

## Current Phase
Marketing signup creates the tenant/business and first Store and captures
business identity, physical address, phone, country, operating currency, owner
identity, and a validated Business Profile. Category, Products/Services/Both,
order-channel, and team-size answers are descriptive onboarding context only;
they never select a Catalog, Inventory or Service runtime model.
The supported launch currency set is NGN, USD, GHS, KES, ZAR and EGP.

Early-access signup can now start from a secure marketing access link. The early-access route creates an expiring one-time `OnboardingSession`; `/signup?access_token=...` verifies it, prefills the owner/business fields that came from the lead, and `POST /api/auth/signup` consumes that session exactly once while linking it to the created tenant and owner.

The chosen business slug reserves the future public storefront address:
`<tenant>.ewatrade.com` in production. Signup may also retain a tenant-specific
POS hostname, but it never creates a tenant-specific dashboard hostname. Every
business uses the shared dashboard at `dashboard.ewatrade.com` in production or
`ewatrade-dashboard.localhost` in local development; active business context is
resolved from the authenticated membership and active-tenant cookie.

The browser signup is a neutral three-step flow: reserved storefront address,
business details/profile and owner details. Its 15-category profile question
personalizes recommendations without asking for a business runtime mode. The
backend creates one neutral merchant workspace, and the success
screen distinguishes the reserved storefront from the shared dashboard.
Duplicate owner phone numbers fail before account creation with a clear field
error.

Marketing signup dispatches the welcome email through `@ewatrade/email` after tenant creation. The signup response includes `emailDeliveryStatus` so the success UI can distinguish a sent confirmation from a provider failure instead of claiming delivery unconditionally.

Mobile presents three short, industry-neutral introduction steps. Owner signup
then reveals three focused stages: business identity/location/currency, a
searchable Business Profile plus Products/Services/Both, order channels and
team size, followed by owner name and email OTP or Google authentication. The
operational workspace starts empty and becomes Product-only, Service-only or
mixed from the Catalog Items the business actually creates.

## Product Rules
- Keep first-run setup compact and operational.
- Treat the chosen subdomain as storefront identity, never as a dashboard host.
- Do not hard-code feed, grain, or any other case-study product as the product identity.
- Store onboarding values by tenant/store scope so multiple businesses and stores remain isolated.
- Treat Business Profiles as versioned descriptive metadata. They may rank
  quick setups and tailor copy, but never gate capabilities, permissions, or
  Catalog Item kinds.
- Treat `Store.currencyCode` as the commerce source of truth. Tenant currency is
  the default for a newly created store; missing legacy values fall back to NGN.
- Render the selected currency symbol on every money field and display. Unknown
  legacy codes render as the code instead of an incorrect symbol.
- Currency changes after transactions, exchange conversion, and historical
  repricing are outside first-run onboarding.
- Keep Catalog capability derived from actual Product and Service Items, never
  a signup template.
- Keep the shared DB helper as the write path for dashboard and API Store
  creation.

## Deferred
- Setup-completion analytics beyond the first completed signup/session record.
- Onboarding analytics, drop-off reporting, and admin review tools.

## Behavioral Validation

- Browser signup was completed against the local marketing app and created a
  real tenant, Store and owner session.
- The success CTA opened the shared dashboard rather than a tenant dashboard
  subdomain.
- Desktop and 390 px signup layouts were reviewed for flat dividers, padding,
  scrolling and clear storefront/dashboard copy.
- The created owner switched among five local QA businesses without tenant
  cache leakage.

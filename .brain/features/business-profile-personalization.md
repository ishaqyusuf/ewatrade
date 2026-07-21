# Business Profile Personalization

## Status

Implemented on 2026-07-21 for marketing signup, mobile owner signup, dashboard
first-Store setup, tenant context, and Catalog quick-setup recommendations.

## Purpose

Learn enough about a new merchant to prioritize relevant setup guidance without
turning an industry label into a runtime business mode. Stores remain neutral
and may contain Product Items, Service Items, or both.

## Shared Profile Library

- `@ewatrade/utils/business-profiles` exports a versioned, immutable,
  JSON-backed library of 15 profiles with stable keys, titles, descriptions,
  tags, recommended Product/Service kinds, and matching Catalog helper keys.
- The launch profiles cover general retail/groceries, animal feed/agricultural
  supplies, fashion/apparel, fabrics/tailoring, drinks/water distribution,
  food/bakery/catering, beauty/salon/spa, laundry/dry cleaning,
  electronics/phone shops, repair/maintenance, pharmacy/health retail,
  hardware/building materials, wholesale/distribution, professional services,
  and other/mixed businesses.
- Shared selectors support search, stable-key validation, Store metadata reads,
  kind-specific helper recommendations, and deterministic helper ranking.
- A profile contains no prices, stock, tenant/store IDs, permissions, enabled
  features, or runtime mode.

## Signup And Store Setup

- Browser signup replaces the loose industry value with a validated business
  category searchable by title, description, or tags,
  Products/Services/Both operating answer, order channels, team size, and a
  required description for Other/Mixed.
- Mobile owner signup keeps business identity and account authentication short
  while inserting a searchable `Personalize your workspace` step before email
  OTP or Google authentication. A single-purpose profile automatically suggests
  Products or Services; the owner may change that descriptive answer.
- Dashboard first-Store setup provides the same searchable category selector
  and captures the operating answer, primary order channel, team size, and
  Other/Mixed description.
- Email OTP request/resend/verification and Google signup carry the same bounded
  profile answers so both authentication methods create equivalent Store
  onboarding snapshots.

## Persistence And Personalization

- Profile answers are stored under `Store.metadata.retailOps.onboarding` with
  schema version, capture source/time, currency, operating model, order
  channels, team size, and optional Other/Mixed description. Completed
  onboarding sessions retain the same snapshot where that flow exists.
- Protected tenant context exposes only the validated Store profile key.
- Product/Service choice cards label the profile-relevant item kinds. The
  full-screen quick-setup picker ranks mapped helpers first and labels them
  `For your business`; every helper remains searchable and selectable.

## Guardrails

- Business profiles recommend and prioritize; they never authorize, gate
  navigation, choose inventory semantics, or change Catalog/Service contracts.
- Products and Services remain item-level decisions. Mixed businesses remain
  first-class.
- Helpers remain editable draft prefills and never auto-save prices, stock, or
  Catalog Items.
- No Prisma schema or migration is required; existing bounded JSON metadata is
  used for descriptive onboarding context.

## Verification

- Shared tests cover the 15-profile contract, search, stable keys, helper
  references, profile ranking, forbidden runtime fields, and Store metadata
  parsing.
- Signup/API/database tests cover profile validation, Other/Mixed description,
  Store onboarding snapshots, OTP signup, Google signup, and tenant-context
  exposure.
- Dashboard, marketing, API, database, utility, and mobile TypeScript checks
  plus the mobile auth/onboarding guard protect client integration.

# Store Currency and Formatted Money Inputs

## Goal

Make each business select an operating currency during onboarding and use that
currency consistently across web, mobile, public storefronts, service requests,
reports, previews, and offline retail operations.

## Supported currencies

- NGN — ₦
- USD — $
- GHS — GH₵
- KES — KSh
- ZAR — R
- EGP — E£

## Implementation

1. Add shared currency metadata, validation, country suggestions, symbol lookup,
   major/minor conversion, display formatting, and editable money formatting to
   `@ewatrade/utils`.
2. Add reusable web and mobile money fields that display a non-editable currency
   prefix and emit normalized decimal strings.
3. Carry the selected currency through marketing, dashboard, and mobile
   onboarding into both the tenant and first store.
4. Add active-store currency to mobile auth/session state and reconcile it from
   the current tenant when online.
5. Replace hard-coded currency symbols and duplicated money formatters across
   merchant, public, reporting, sharing, service, and preview surfaces.
6. Rename persisted mobile offline monetary fields to explicit `*Minor` names
   and add a one-time persisted-state migration from legacy major units.
7. Update contracts and tests, run targeted lint/type checks and QA, then test
   representative NGN, USD, and GHS flows in browser and mobile emulator.

## Data decisions

- `Store.currencyCode` is the commerce source of truth.
- Tenant currency is the default for newly created stores.
- Missing legacy values fall back to NGN.
- Unsupported legacy codes render as their code instead of an incorrect symbol.
- All launch currencies accept up to two decimal places.
- Existing server-side monetary values are not migrated or converted.
- Currency changes after transactions, exchange rates, and historical repricing
  are outside this change.

## Documentation

- Update the Retail Ops feature, API contracts/endpoints, database onboarding
  mapping, task status, and an ADR covering store-scoped currency and mobile
  minor-unit storage.
- Record the reusable mobile money-field convention in the personal Expo coding
  standards after implementation.

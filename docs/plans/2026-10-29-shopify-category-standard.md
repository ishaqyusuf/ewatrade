# Shopify category standard and tree picker

Owner requested implementation, 29 October 2026. No deployment authorized.

## Migration contract

Midday reference: `apps/dashboard/src/components/select-category.tsx` in the local Midday checkout: typed query-backed choices, controlled selection and shared components. Preserve EwaTrade's existing optional inline Category section and sheet/form ownership; no new modal, route, table or store. Operate mode; existing semantic tokens, rows and focusable buttons are the visual authority. Mobile reuses the owning SearchFooterField/BottomSearchFooter; this editor receives its query.

- [x] Inspect current storage, APIs, assistant payloads and storefront eligibility/search.
- [x] Standardize new choices on pinned Shopify 2026-08; preserve legacy rows/explicit drafts without offering presets as parallel suggestions.
- [x] Bounded tree browsing/search on Dashboard and mobile; lean assistant search, selected-category attributes only, local title suggestions without provider calls.
- [x] Persist stable Shopify keys using existing tenant category rows/foreign keys; preserve unchanged item assignments; include saved category paths in storefront literal-term search in both Prisma and SQL price sorting.
- [x] Focused tests, scoped fast smoke/types, H01/H02, actual local browser review, Brain updates and owned commit.

## Storage and boundaries

No Prisma schema changes or bulk backfill. `CatalogCategory.key` holds `shopify:<root-id>` and `shopify:<selected-id>` for the existing root/selected-descendant adapter. Descendant row labels retain the remainder of the full path; `CatalogItem.category` is the compatible full path, `categoryId` is the local root FK and `subcategoryId` is the local selected-descendant FK. Arbitrary-depth parent links live in the version-pinned reference, not duplicated per merchant. Legacy/custom/preset rows and explicit prior drafts remain compatible, unchanged assignments keep their local IDs. New picker suggestions are Shopify only, including Services. Public listings retain all eligibility, tenant/Store scope, listing caps and cursor rules; category text search sees only already eligible items. Public category navigation remains by root FK; nested storefront filters are separate scope.

## Verification scope

Use owned paths to exclude concurrent storefront/content/catalog-detail work. No model/provider calls, deployment or native release. No new sale/payment/fixtures for UI verification. Local UI changes may be exercised then discarded on an existing item. Native compilation/source verification is distinct from device acceptance.

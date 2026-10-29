# Category combobox in Essentials — 29 October 2026

Owner requested a single category input with combobox search, selected display and an x clear action, then moved it into Essentials. Supersedes only the Dashboard tree presentation in the earlier Shopify category standard delivery. The native tree, reference APIs, assistant optimizations, persistence and storefront search remain unchanged. No deployment.

## Implementation contract

Reuse the existing shared Combobox/InputGroup controls and the local Midday select-category pattern: controlled selection, query-backed options, existing field/form ownership and semantic styling. Category is an optional Essentials field directly below the name for Products and Services. Remove the old optional Category accordion/nav entry and explanatory/tree/breadcrumb controls. Full canonical paths remain the saved value; searching alone does not change the category, choosing changes it, x clears it and restores focus. Dismissing an unselected search restores the saved draft selection. Lookup is debounced250ms, server-filtered, bounded and cached; no full dataset or AI call is introduced.

## Verification

- Offline doctor passes. Owned two-path test:quick plan/source smoke passes220tests/1,481assertions across41files plus QA-tooling types and scoped Biome. Concurrent source is excluded explicitly. The first broader plan surfaced an unmapped shared UI path; that tentative global clear-label edit was removed, and the final control composes existing shared primitives locally. There is no shared UI source change.
- Dashboard TypeScript passes; Impeccable detector returns no findings; owned whitespace review passes.
- Actual existing Service form: Category appears in Essentials and is absent from optional sections. Search Eggs, select Whole Eggs, inspect the actual input value/full-path display, x clear and resume search. The initial Enter-key check exposed Base UI allowing implicit form submission when no item is highlighted: it saved the existing QA service with its current form fields and closed the editor. This was unintended. Category input now prevents the native Enter default (except IME composition), while retaining Base UI highlighted-option selection. No further saved-record changes are used for verification; final selection is cleared before handback.
- Standard existing-data qa:smoke was attempted but its receipt549dec4337556652851499326a6e6b77ce813280 was invalidated because concurrent source changed during the run. It is not passing evidence. A final retry is recorded separately if valid. No deployment implied by any smoke result.
- Screenshot /private/tmp/ewatrade-category-essentials-combobox.png is private local visual evidence, not a committed merchant record.

## Final keyboard verification

Actual browser after the repair: Enter on an unresolved search leaves the editor open and does not submit; Arrow Down then Enter on Rice selects the highlighted category and leaves Save changes available. X clears and refocuses; final test category is empty again. The initial unintended QA save is disclosed above and is not erased or described as a read-only check. Screenshot /private/tmp/ewatrade-category-essentials-final.png shows the final Essentials placement.

## Source hashes

- `apps/dashboard/src/components/catalog-item/catalog-category-editor.tsx`: `2bdbf6186a8eeea566cf21ed69829e7793cfcbc39266a4ff4f6a28ab32e75b91`
- `apps/dashboard/src/components/catalog-item/form.tsx`: `6b52e5376dfdfa4a8e1e200ee743fbd57c38262cbed38660854d2ee843a22ce4`

No deployment.

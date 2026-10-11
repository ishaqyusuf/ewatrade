# Purchase registration review — 11 October 2026

Evidence: deterministic query/rule tests; no database or model execution.

Extracted the existing registration normalization and source checks into
purchase-registration-source.ts, reused by the canonical Book-locked command and
new getFinancePurchaseRegistrationReview. Existing input normalization, payload
hash material, posting-date check, supplier/Store/currency scope, inventory control,
unit configuration and exact precision rules remain intact. No new writes.

Review exposes exact agreement date, costs, quantities, category/configuration
identities, supplier and Book. Its effect is explicitly agreement-only: no payable
or stock. Existing registerFinancePurchaseInTransaction exported for future atomic
proposal composition; root transaction wrapper unchanged,10s/30s bounds unchanged.

7 focused tests/64 assertions pass across new review and existing recognition rules.
Scoped TypeScript passed (exit0). Test doubles cover source
refusals; real registration database regression and assistant proposal/editor/web
acceptance remain pending. E05 incomplete; no mobile/schema/deployment change.

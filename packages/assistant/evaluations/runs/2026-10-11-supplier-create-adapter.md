# Supplier creation adapter — 11 October 2026

Evidence: deterministic schema tests and scoped compilation; no model/provider run.

- Strict supplier_create action: exact Book, normalized code and trimmed name;
  rejects authority, command and financial fields.
- Planned dashboard Owner/Admin capability finance.supplier.create delegates to
  canonical finance.createSupplier semantics. No persistent activation.
- Adapter uses fresh canonical review and fingerprint, then the existing
  createFinanceSupplierInTransaction inside proposal completion transaction.
  Duplicate-code and authority checks remain canonical. No nested transaction.
- Receipt records supplier and Book IDs; dashboard opens the existing global
  supplier-statement sheet, preserving the assistant route. Browser not yet tested.
- Tool instructions require existing-supplier search and explicit code; no invented
  opening balance, purchase, money transfer, ownership or stock receipt.

`bun test packages/assistant/src/general/supplier-create.test.ts` passes one test /
14 assertions. Scoped API TypeScript for adapter and tools exits 0. No broad tests.
Fixture SC01–SC08 retained. Editor, actual atomic database recovery/rollback and
web acceptance remain pending. E05 incomplete; no mobile/schema/deployment change.

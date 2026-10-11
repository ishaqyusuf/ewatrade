# Supplier creation database acceptance — 11 October 2026

Evidence kind: deterministic-integration, provider/model not applicable.
Run ID: 37d2d2e1-9c47-4bed-8e36-ad322dc09510.
Source baseline: 2d82ab72 plus retained supplier acceptance helper in this commit.
Target: isolated Development ewatrade_general_assistant_main_20261009, verified
with current_database(). Process-only capability activation restored in finally.

Retained entry: general-proposals.integration.test.ts with
RUN_GENERAL_ASSISTANT_INTEGRATION=1 and RUN_GENERAL_SUPPLIER_CREATE=1, verified
profile and ephemeral signing key supplied by the local acceptance runner.

Result: one focused suite passed, 24 assertions, 77.20s, process exit 0.

- Unknown Book refused; exact normalized identity and no-balance review checked.
- Injected COMPLETED persistence failure rolled back supplier and command;
  proposal remained PENDING.
- Concurrent confirmation produced a success; any competing failure was required
  to be CONFLICT. Repeat confirmation recovered the identical receipt.
- Exactly one normalized supplier and one command persisted.
- Independent stale draft and subsequent duplicate draft refused.
- Actual readSuppliers tool resolved the identity and readSupplierStatement
  returned separate zero payable/advance balances and no entries.
- Zero journals and bills. Financial cleanup independently checked Book count zero;
  outer owned tenant/user cleanup completed. No provider or merchant effects.

Scoped integration TypeScript passed. Coverage generation was attempted but blocked
by unrelated unclassified orders.activity.list; no regenerated coverage claimed.
Log: /private/tmp/e05-supplier-create-database.log (local only).
Editor, current-authority revocation after draft, and full web acceptance remain
pending. This is not a live-model evaluation or deployment. E05 remains incomplete.

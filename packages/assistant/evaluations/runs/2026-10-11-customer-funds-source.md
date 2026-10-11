# Customer funds reads — source verification, 11 October 2026

Evidence kind: deterministic unit checks; no model/provider execution.
Implementation: canonical customerLedger accountDetail/sources/statement callers
through the existing fresh-authority GENERAL wrapper. New capabilities remain
planned and dashboard-only. Accounts v2 adds currency cursor continuation.

Focused schema/answer tests verify strict actor/tenant rejection, ten-entry pages,
required source revision and statement snapshot on continuation, exact amounts
above JavaScript safe-integer range, missing Book disclosure, advisory refund
eligibility and page-versus-total distinction. Coverage tests check registry links.

This does not prove database tool execution, tenant/role refusal end to end,
conversation resolution, dashboard rendering or global customer-sheet acceptance.
CF01–CF05 remain not-run model fixtures. No runtime allowlist, schema, mobile or
hosted deployment changes. No new screenshot: this slice has no activated UI.

Result: 8 tests passed / 34 assertions across general-customer-funds.test.ts and
capabilities/coverage.test.ts. Scoped API TypeScript exited 0 after repairing an
incomplete test fixture; the earlier typecheck failure was fixture-only. Capability
coverage regeneration and scoped formatting completed.

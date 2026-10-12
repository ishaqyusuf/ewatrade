# D04 Service intake source evaluation v1

Date: 12 October 2026 (Africa/Lagos). Fixture: `service-intake.v1.json`.
Result: **partial source handoff; no ticket acceptance**. Accepted **13/45 (28.9%)**.
Source package 5/5; acceptance gates 0/4. Desktop web only.

## Verified

- `bun test packages/db/src/queries/service-intake-review.test.ts packages/assistant/src/general/service-intake.test.ts`: **13 tests, 59 assertions, pass**.
- Biome on 15 owned source/test files: pass. Whitespace check of canonical domain
  diff: pass. No broad test suite or schema generation/migration.
- Scoped compiler check before concurrent integration: zero diagnostics. Final
  virtual registry integration after refreshing the 13-file patch: **zero
  diagnostics**. An earlier check found four concurrent cash-count/day-close
  diagnostics; those were resolved by their owning work. No foreign source
  modified. Raw logs in ignored artifacts.
- Native preparation is reused by review/draft; exact quantity, express charges,
  payment bounds, selected customer, current authority/assignee, policy/staleness,
  unavailable Offering, quote refusal and messaging/Finance prerequisites tested.
- Native seam replay returns original identifiers and never starts a nested
  transaction. Root create-and-confirm opens one bounded transaction. Injected
  Intake-line persistence failure leaves no committed draft in the unit boundary.

## Desktop component preview

Actual editor, shared controls, SheetFrame and owning receipt content were bundled
with an API-call trap and synthetic fixtures on the existing port-free dashboard.

- Save yields original Offering IDs, exact quantities, Customer/assignee facts,
  payment 1000 minor and promised `2026-10-15T10:00:00.123Z`.
- Unavailable current choices disable all edits and Save; Retry restores controls.
- Receipt shows original mixed tracked/charge-only lines, total 3000, payment1000,
  balance-at-intake2000 and queued/PENDING_PAYMENT JobLine.
- Original Job ID selection and receipt Close retain mounted editor content.

Screenshots: `artifacts/assistant-operations-parallel/D04/editor.jpg`,
`unavailable.jpg`, `receipt.jpg`. Preview build initially lacked a Next browser env
substitution; that preview-only bundling error was corrected and receipt rendering
rechecked. Temporary public HTML/JS and the agent-created tab were removed.
This is synthetic current-source proof, not HTTP-backed/saved chat acceptance.

## Prepared, not executed

Canonical runner `run-rollback.mjs`: strict root local/Production separation,
exact database/Tenant/Store/Owner, one Serializable rollback transaction, native
mixed graph/replay/payment gate/customer identity/original snapshot/stale/revoked
checks and before/after saved-state proof. No retained fixture or deletion.

Signed runner `run-signed-rollback.mjs`: requires the coordinator's exact saved QA
conversation ID and `RUN_D04_QA_ROLLBACK=1`; ephemeral child-only signer; capability
visibility only in that scheduled rollback process and restored finally. Every
case opens one real bounded root transaction, seeds a proposal inside it and runs
real GENERAL signed decision: completion/replay, changed approval, stale price,
revocation and receipt failure. Domain/proposal/fixtures roll back together.
**G02 owns the connected QA slot; neither runner executed.**

## Remaining limits

Shared 13-file registration patch requires coordinator review/merge. Never replace
shared files with compiler-overlay snapshots. Generated coverage/common Brain
updates belong to the coordinator. Capabilities remain planned.

Native Service Intake lacks a receiving-account input. Finance-backed initial
payment remains a separate Order payment flow; automatic customer messaging is
explicitly refused. Scoped Manager write grants remain unavailable under the
current common policy; global native Job integration stays Owner/Admin or legacy
Manager. These are incomplete D04 scope, not accepted exclusions.

No DB/provider/model/paid/email/message/activation/API restart/key persistence,
mobile/emulator/viewport, hosted config/deployment or git operation. E05 pending
approval remains untouched. Full saved-runtime chat and global object continuity,
optional payment and notification acceptance remain unverified.

# Collections/payouts persistence and repaired packet review

12 October 2026. Coordinator continuation in `Continue assistant operations`.
Database persistence prerequisite cleared; F01/F02/F04/F05 remain unaccepted.
Web acceptance remains 13/45 (28.9%); native parity is not certified.

## Contract and read packet review

- F01 matching authorized controls pass. Wrong source, invalid manual amounts,
  invalid expiry, current-source currency conflict and foreign held-money
  resolution now refuse as expected. Executed the existing actual-contract
  coordinator probes; no provider or database payment command was invoked.
- F04 updated the stale coordinator fixture to the owner's current fixed policy
  signature (`source`, actor role, payouts stop). Valid control passes; unsafe
  derived total and empty resolved account name now refuse. This closes the two
  earlier pure-contract findings, not canonical payout acceptance.
- S05 second repairs preserve whole long labels by reducing the tool page size
  and rereading with a cursor immediately after the displayed records. The direct
  oversized-card diagnostic shows five labels and discloses the unshown records;
  the tool-path regression verifies that they continue on the next page. Finance
  exclusion is disclosed; authorized finance stream and Store exclusion have
  focused test coverage. Canonical original Open flow, connected source/role/
  timezone/privacy comparisons and measured performance remain required.
- G05 reads through separate canonical callers, keeps refusals independent and
  never presents denied values as defaults. Receipt read currently uses the
  canonical order role check; the `invoices` entitlement is enforced on receipt
  changes, not this receipt-settings read. Paid reminders use their own canonical
  gate. Settings proposals/communications and saved web/native journeys remain open.
- Focused source checks: 19 pass / 121 assertions across repository activity,
  activity answer and settings answer tests, with an unreachable placeholder URL.
  No connected or model acceptance is implied by these tests.

## Applied database foundation

Added seven models: CollectionIntent, CollectionProviderEvent, CollectionHold,
PayoutBeneficiary, PayoutIntent, PayoutProviderEvent and BusinessPayoutSetting.
Added CollectionProviderEventOutcome (RECEIVED/APPLIED/HELD/IGNORED/REJECTED),
without changing existing prescription provider-event semantics.

Collections bind Store/Order to Tenant. Holds bind their exact Tenant/Order/intent
and event/intent. Payouts bind Book to Tenant, bill and beneficiary to the same
Book/supplier, debit and settlement/correction journals to the same Book. Event
replays use `(provider, providerEventId)` uniqueness; payout references are unique.
Full account numbers are absent. Actor IDs remain audit scalars, as in existing
commerce/finance records, so financial history does not block account deletion.
These new families still need privacy inventory/retention handling before writes
or availability; no collection/payout command is registered by this checkpoint.

Verified canonical `.env.local` Development profile with production isolation;
target `ewatrade_qa_v1`. The existing foreign account-privacy migration was already
finished before this operation. New Prisma-generated migration contains only
the seven new tables, one enum, indexes and foreign keys; no unrelated DDL.

- `bun run db:generate --local`: passes.
- `bun run db:migrate --local -- --name collections_payouts`: passes; creates and
  applies `20261012160840_collections_payouts`.
- `bun run db:push --local`: passes, already in sync.
- `bun --env-file=/dev/null packages/db/scripts/qa-collections-payouts-schema.ts`:
  passes on Development. Applied ledger/checksum matches generated SQL; positive
  writes exercise all seven families in a transaction. Wrong source/event/supplier
  bindings and duplicate provider identities/references refuse. Always rolls back;
  all seven table counts equal their pre-run values afterward.

Migration SHA-256: `2418926efe66ccfb4df88a4ef6a4a81792b1a136f60848f9b76251a7f8d8f6d1`.

No reset, data-loss flag, handwritten migration, provider call, saved payment or
Preview/Production database action. Persistence does not prove atomic command
claims, manual/online exclusion, authorization, dispatch, reconciliation or posting.
Those implementation packets remain with the separate implementation agent.

## Verification limits and inherited mobile setup

Fresh database/API compiler checks exit 2 on errors outside the reviewed packet
paths; no diagnostics name staff activity/settings or the repaired payout fixture.
Schema generation passes. Final focused script/compiler and coverage results are
recorded in the continuation below if further source changes affect this checkpoint.

Created `EwaTrade Assistant QA` Android 14 ARM64 device using the existing system
image. Device Manager visibly lists it. Launch clicks fail in computer use with
`windowNotFoundAtPosition`; no app flow or native acceptance was tested.

Brain impact: schema, relationships, migrations, persistence ADR, assistant feature,
delivery plan and in-progress task notes. These remain local-only documentation.

## Final source verification

Required migration/push and Development rollback run both complete successfully.
Final database compiler still has32diagnostics outside the reviewed packet/script
paths; the added QA script has zero diagnostics after its URL guard. Existing API
check has diagnostics outside staff activity/settings. Broad typechecks remain red;
no claim of a green monorepo build. Biome check passes for the new script and updated
fixture; coverage snapshot current and impact gate pass on the shared working tree.
No UI surface changed by the schema/fixture coordinator work, so UI testing is not
applicable to this source integration. S05/G05 source tests are working-tree evidence;
those packets are not integrated by this persistence commit.

Reviewed payment contract hashes: collection
33e8940415682bc48d8f0ac566e887d6f4787a2e40db0c6998a8916e0e0d00e9; payout
3640be834ee8bbe5acf991ae901c4161fb44e17958cd43c5b8408d8cdc905293.
Schema hash808f62cd90bafe50fdcc9010e098261886e0eca9cb5f53c7835c5fbff75e8069.

Payment-package typecheck passes. During review, the implementation agent moved
collection rules to packages/utils/src/collection-intent.ts with a payments
re-export and began canonical command work. Those active source/contract files
are left in the working tree for a frozen implementation packet. This coordinator
commit contains the reviewed schema, Prisma migration, rollback verifier and
persistence handoff/evidence only. Canonical collection utility reviewed hash:
362627c82ef839f6e453a14995c0ff895b0ad25c6db44b0be574f873678fd46c.

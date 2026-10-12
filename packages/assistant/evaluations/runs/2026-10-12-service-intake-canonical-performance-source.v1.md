# D04 canonical read optimization source v1 — 12 October 2026

Outcome: authorized proposal1 and proposal3 implemented, focused offline checks
pass, ready for parent diff review. Proposal2 (large canonical write-core/Order
summary extraction) remains on hold. No connected DB/retry/signed/provider call,
API restart, schema edit, generation, migration, persistent fixture, capability
activation, shared registry/export edit or git stage/commit occurred here.
D04 stays partial/planned/unaccepted; accepted roadmap13/45 (28.9%) is unchanged.

## Final implementation

Canonical Order resolution now lazily loads command-local Offering batches,
grouped by ordinary ACTIVE versus progressive ACTIVE/DRAFT eligibility. The
first line of a mode triggers its batch; custom line handling retains its place.
Every original relation include and Tenant/catalog/Store predicate is retained.
ID/mode caches never mix progressive DRAFTs into ordinary sales and are not shared
between commands. Each input line still performs the original work policy,
attestation, availability, price/quote, expected-price, note and quantity checks
in order. Reservation/financial locks and native write loops are untouched.

A private confirmation body receives only canonical transaction-local persisted
Intake lookup/draft results. Public standalone confirmation still loads and
Tenant-checks the Intake. Atomic create-and-confirm avoids its immediate duplicate
query while preserving schema, Tenant/ID, status, replay/payload, native Order/
payment/authorization/work/event/assignment/due/notification/update behavior.
It never accepts a model/caller-supplied persisted graph. Fresh assistant review
and revision checks remain unchanged, even on replay.

Tracked Order line reads keep the complete persisted line and immutable snapshot,
removing only the unused current Offering/serviceOffering relations. Missing
snapshot authorization policy remains a typed refusal; current Catalog data does
not replace saved work policy. Both complete Job hydrations and serialized public
Order/Service responses remain unchanged. Command and owning receipt stay inside
one caller-owned transaction, maxWait10000/timeout30000. The four-case verifier,
all original assertions, financial/state checks and limits are unchanged.

Native reminder helpers moved to an internal module for semantic verification.
Replacement still cancels pending/ready due reminders first. Absent phone then
returns without settings/timezone reads. With a truthy phone, settings and channel
eligibility are evaluated before reading timezone. Eligible reminders keep their
same default/explicit channel, truthiness, timezone/fallback message, lead time,
subsecond timestamps, upsert key and pending/ready state. Cancellation errors
still propagate and prevent replacement; no provider or dispatcher is added.

## Exact own diff and validation

Nine production/helper/test paths:
- packages/db/src/queries/commercial-orders.ts
- packages/db/src/queries/commercial-order-offering-resolution.ts
- packages/db/src/queries/commercial-order-offering-resolution.test.ts
- packages/db/src/queries/commercial-order-offering-snapshot.test.ts
- packages/db/src/queries/service-work.ts
- packages/db/src/queries/service-due-reminders.ts
- packages/db/src/queries/service-due-reminders.test.ts
- packages/db/src/queries/service-intake-read-refinements.test.ts
- packages/db/src/queries/service-intake-review.test.ts

32 focused domain tests/122 assertions pass across5 source test suites. New
coverage includes distinct-ID batching with per-line price failures, first-error
order, missing targets, custom-before-catalog lazy behavior, per-line repeated
progressive attestations, exact deep predicates/includes, separate mode/scope
caches, failed read propagation, atomic versus standalone full work output,
persisted replay, assignee/due/payment gate/snapshot identity, charge-only work,
missing immutable policy, scoped Tenant/status/idempotency refusals, reminder
cancellation/read order, actual channel/timezone/default/truthiness/schedule keys.
Canonical review tests retain fresh actor/customer/assignee, price/quote/payment,
notification, transaction bound and draft rollback failure coverage.

The unchanged rollback-case orchestration suite also passed8 tests/24 assertions
in the first focused run (37 total then); the final domain-only run was32/122.
This is source evidence, not connected all-four-case acceptance.

Biome passes9 own source/test files with no remaining fixes. Own tracked diff
whitespace check passes. Actual scoped TypeScript exits0 with zero diagnostics,
including native/helper/semantic tests, current API/dashboard integration and
runner; no virtual registration overlay. Initial test-only incomplete-fixture
expectation diagnostics were corrected without weakening production types.
UI testing is not applicable: these internal reads have no changed UI surface.

Commands:
- bun test packages/db/src/queries/service-intake-read-refinements.test.ts packages/db/src/queries/commercial-order-offering-resolution.test.ts packages/db/src/queries/commercial-order-offering-snapshot.test.ts packages/db/src/queries/service-due-reminders.test.ts packages/db/src/queries/service-intake-review.test.ts
- bunx --no-install tsc -p /private/tmp/d04-tsconfig.json --noEmit
- bunx --no-install biome check (the9 listed owned source/test files)

## Foreign feature configuration and measurement limits

A concurrent FOREIGN Prisma generator edit enables relationJoins, and the current
generated runtime metadata also contains that feature. It was preserved and was
not staged, reverted, generated or migrated by this chat. Checkpoint a91961b0's
generator has no preview feature. The v3 failed run did not fingerprint its exact
generated runtime configuration, so do not retrospectively assert it matched
the committed schema or attribute future speedup solely to these owned changes.

Ignored optimization-feature-configuration.json captures exact checkpoint/current
generator blocks, current schema SHA256 and generated internal/class.ts SHA256/
feature snippets. At capture, schema hash was
f5859c52d8ae537c53eaeccc9cc6d16205e9fd051c4b3aea8ae3202203d42e8f
and generated class hash was
1d96375730d51972cbac2c35f64f98d0ee285684a9d14673f1e231bbf6f53665.
No own relationLoadStrategy flag, migration or public skip option was introduced.
Before any coordinator-scheduled timing, record actual schema/client features
again. A comparison must hold feature configuration constant or disclose the
combined change; source unit timings are not database latency measurements.

The prior v3 attempt remains failed at30s,0/4 completed cases, full saved-state
hashes matched, Prisma disconnected and QA slot released. No additional run was
made. The next exact-owned canonical attempt requires coordinator scheduling;
there is no signed authorization or ticket acceptance here.

## Brain and handoff

Ticket feature/plan/composition ADR record internal batching/private persisted
confirmation/reminder read ordering, held proposal2 and the foreign-feature timing
qualification. Database schema and API/public contract are unchanged by this work,
so no common schema/contracts/permission docs were edited. Parent owns integration
and commits. performance-owned-paths.json is the exact delta review array;
owned-paths.json remains the complete D04 ownership array with common/foreign/
Brain/artifact paths excluded. Own files are ready and frozen for parent review.

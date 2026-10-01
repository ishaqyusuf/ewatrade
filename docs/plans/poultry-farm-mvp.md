# Poultry farm MVP plan

Date: 1 October 2026  
Status: Proposed implementation plan; no application implementation or rollout performed.  
Scope: A farm keeping layers, broilers, or both. Planning is deliberately outside Brain, as requested.

## 1. Product outcome

Let a poultry farm keep its daily production records beside its existing sales, stock, customers, and payments. The first release should answer:

- How many birds are in each flock?
- How many eggs were collected, accepted for sale, and rejected?
- How much feed was used?
- What is the latest recorded broiler sample weight?
- Which egg collections have reached inventory?
- Which completed bird sales have been matched to a flock?
- Which flocks are missing today's record?

The existing commerce workspace remains the place to sell, collect payments, and fulfil orders. Farm records add production context. Cost accounting and calculated profit are a follow-up release.

## 2. Business selection and activation

### What exists today

`packages/utils/src/business-profiles.json` contains an `animal-feed-agricultural-supplies` profile. Its poultry/farm tags describe feed and supply trading. It is not a poultry production module. Profile selection currently recommends Catalog Item kinds and quick-setup helpers. Workspace navigation separately derives available features from server facts.

### Proposed onboarding

1. Add **Poultry farm**, profile key `poultry-farm`.
2. After selection, ask **What do you keep?**: Layers, Broilers, or Both.
3. Reuse the existing business, currency, timezone, and Store setup.
4. Offer **Set up my first flock** after business creation. It may be skipped.
5. Show Farm setup immediately to an eligible business, even before its first flock exists.

Layer mode shows egg collection. Broiler mode shows sample weights and bird-sale matching. Both shows both workflows, while each flock has one type.

Do not rename the feed-trading profile or silently convert existing feed merchants into farms. Existing businesses can enable poultry operations through an Owner/Admin setup action. A business described only as “Farm” must choose Poultry before poultry workflows are enabled; crop, fish, and other livestock operations are outside this release.

“Midwife” is an unresolved wording clarification. This plan covers poultry. If midwifery was intended literally, it needs a separate service/healthcare plan and does not receive flock or egg features.

### Activation rules

- Profile selection recommends/defaults the module. Saved Farm settings are the authority for whether it is configured.
- Effective access requires the rollout switch, enabled Store settings, and the current user's permission. A client-selected category never authorizes writes.
- Store-scoped settings allow different branches to operate differently within one business.
- Disabling the module blocks new farm writes and keeps historical records readable to authorized managers. Re-enabling preserves history.
- Changing the business category never deletes farm records or changes Catalog stock.
- New Farm navigation must not depend on existing orders or inventory activity.

## 3. Launch scope

| Capability | First release | Boundary |
|---|---|---|
| Poultry onboarding | Layers, Broilers, Both | No generic agriculture workflow |
| Flock register | Type, name, house label, opening count, age baseline | One Store per flock; no inter-farm transfers |
| Daily records | Mortality, culls, feed kg, eggs, optional weight sample, notes | One authoritative record per flock/local date |
| Egg inventory | Explicitly post accepted eggs through existing stock ledger | No new inventory ledger or automatic reusable prices |
| Broiler sales | Match existing fulfilled bird lines to a flock | Explicit operator action; no automatic historical matching |
| Farm summary | Counts, totals, missing records, reconciliation issues | No accounting profit or predicted harvest |
| History/export | Bounded date filters and CSV | No scheduled reports or server PDF generation |
| General commerce | Reuse Catalog, Orders, Customers, payments, staff | No duplicated sales, payment, or customer domain |

## 4. Flock setup

Required fields:

- Flock name, such as “Layers House A” or “Broilers October Batch”.
- Type: Layers or Broilers.
- House/pen label; use a short label rather than a separate housing-management system.
- Opening record date and current live bird count, as whole numbers.

Optional fields:

- Actual hatch date, if known; otherwise age in weeks on a specified date.
- Breed and supplier name as simple informational fields.
- Notes and the relevant existing egg/bird Catalog selection.

Opening an existing flock means **current birds at the opening date**, not its original chick purchase count. Do not invent earlier deaths, production, or costs. Mark earlier history as unavailable.

Flocks are Active or Closed. Closing requires a reason and records remaining birds; nonzero closure is visible in reconciliation. Closed flocks accept no routine new entries. Manager corrections remain audited. A type change after production records exist is refused; create a separate flock instead.

## 5. Daily record workflow

Mobile action: **Farm → Record today → Select flock → Enter figures → Review → Save**.

Common fields:

- Store-local date, defaulting to today.
- Deaths and culls, explicitly entered as zero or a whole count.
- Feed used in kg, optional exact decimal; blank means not recorded.
- Optional note.

Layers add:

- Accepted/sellable eggs.
- Cracked eggs rejected from sale.
- Other rejected eggs.
- Total collected is the sum of these categories; categories do not overlap.

Broilers add optional:

- Number of birds weighed.
- Total sample weight in kg.
- Average weight is calculated from those two inputs. It is a sample statistic, not the flock's total weight.

Rules:

- Whole bird/egg counts; nonnegative values; exact feed and weight quantities.
- An explicit zero is different from a missing record. Reports show their coverage.
- Enforce one logical record per flock/date. Network retries return the same saved result.
- Use expected flock/record revisions to reject concurrent changes with a clear reload action.
- Deaths/culls cannot make the recorded flock count negative.
- Operator entries are for today. Managers can enter or correct history from the flock opening date, with a reason. Recalculate subsequent bird counts and refuse a change that makes any later balance negative.
- Historical egg production is not automatically historical stock. Posting a missed collection requires explicit confirmation that the quantity should enter current stock.
- Display unposted accepted eggs after save, with a separate **Add to egg stock** action. Daily recording must work even when Catalog setup is unfinished.
- Farm writes require an internet connection in v1. Existing offline order checkout remains available under its existing policy; farm entries are not added to that queue.

## 6. Connect production to existing inventory and orders

### Eggs

Use an existing or explicitly created Product with **Egg** as its main unit. Add a shared-pool Crate selling unit using the farm-confirmed count, for example 30 eggs per crate. Suggest the factor but require confirmation. The MVP posts to one accepted-egg variant per flock; grading and multiple collection lots are deferred.

`Post egg collection` must atomically:

1. Reauthorize the Store, flock, daily record, and selected compatible stock balance.
2. Confirm the accepted quantity has not already been posted.
3. Create the existing inventory receipt with the exact collection quantity.
4. Save the daily record → Stock Operation reference and audit facts.

The existing stock receipt function starts its own transaction. Extract a transaction-scoped helper and keep its existing public wrapper, so the farm command can reuse that helper inside one database transaction. Do not call two independent mutations or copy stock arithmetic into the Farm module.

Retries must not add stock twice. Existing unit/configuration revision and reservation checks remain mandatory. Rejected eggs never enter accepted-egg stock.

Correcting a posted collection requires a manager action and an atomic inventory correction using the existing ledger. If a decrease would reduce stock below reservations, refuse the correction and explain that committed demand must be reconciled first. Never rewrite previous stock movements.

Example: 900 accepted eggs and 12 cracked eggs produce a collection total of 912. Posting adds 900 eggs, equivalent to 30 crates at a confirmed factor of 30. Repeating the same command still leaves 900 eggs received. Fulfilling a 20-crate order then deducts 600 eggs through the normal Order flow.

### Broilers and spent layers

Keep selling live birds by whole bird count using the existing Product, stock, and Order flows. A sample weight never changes inventory quantities or selling prices. Dressed-weight sales and slaughter yield are deferred.

For v1, creating a flock does not automatically receive its entire count into sellable stock. Managers explicitly receive birds ready for sale through existing Stock Intake. Show this distinction in setup and reconciliation.

After fulfilment, **Match bird sale** links a fulfilled bird Order line and quantity to one or more flocks. Matching records the farm's bird-out event; it does not deduct inventory or create another sale/payment. Enforce:

- Same Tenant and Store; configured compatible bird Product/variant; whole quantities.
- Allocated quantity across all flocks cannot exceed the fulfilled eligible quantity.
- A flock cannot supply more than its recorded remaining birds.
- Retry identities and explicit correction references prevent duplicate deductions.
- Cancellation before fulfilment never counts as birds leaving the farm.
- Returns/refunds require review: money refunded does not establish that live birds returned. A physical return must be explicitly reconciled against existing fulfilment/return facts.

Offline-created Orders can be matched only after successful replay and fulfilment. Show unmatched fulfilled bird quantities to managers. Returns after matching create a visible review issue; do not silently undo farm movements.

Known v1 limitation: live-flock counts and ready-for-sale bird stock are explicitly reconciled, rather than automatically synchronized. Deaths among birds already received into sale stock require an existing stock adjustment as well as the flock death record. Surface discrepancies; do not claim that this release automatically prevents every flock/stock mismatch. Automatic bird-stock synchronization is a later slice.

### Feed

Daily feed kg is a production observation. It does not consume generic feed inventory in v1. Tell the user this where they enter feed. Integrating feed purchase units, issues to houses, stock depletion, and costs belongs in the next release; existing feed quick-setup recipes are selling-stock examples, not a farm consumption model.

## 7. Farm screens and summaries

Mobile gets the full operating workflow. Add Farm as an entry within the existing shell; retain the current bottom navigation. Do not make farm users switch between duplicate Orders or inventory screens.

| Screen | Contents/actions |
|---|---|
| Farm overview | Active flocks, today's collections, missing entries, unposted eggs, unmatched bird sales |
| Flock list/detail | Type, house, age if known, live count, record history, latest sample weight |
| Flock setup | Opening count/date and optional context |
| Daily entry/review | Type-specific fields, clear units, explicit zero/missing states |
| Egg stock posting | Selected balance, count, configured crate equivalent, confirmation |
| Bird-sale matching | Fulfilled lines, unmatched quantities, selected flock allocations |
| Farm report | Date/flock filters, totals, coverage, reconciliation, CSV |

Dashboard v1 provides a read-only Farm overview/history/export for managers. Mobile owns the initial setup and write workflows. Dashboard editing is follow-up scope; follow the existing dashboard composition patterns when adding the read route.

Summary definitions:

- **Recorded live birds:** opening count plus explicit bird returns/increases minus deaths, culls, and matched physical sales. Never subtract pending orders.
- **Accepted eggs / rejected eggs:** sums of current daily record revisions, separately displayed.
- **Feed used:** sum of entered kg; show “recorded on X of Y expected flock-days”.
- **Latest average sample weight:** total sample kg divided by sample count, with sample date/count.
- **Collection posted:** accepted quantity linked to posted Stock Operations, separate from production recorded.
- **Missing records:** active flocks without a daily record for the selected eligible local date, respecting opening/closing dates.
- **Unmatched birds sold:** eligible fulfilled quantities less valid farm allocations, with return exceptions visible.

No profit, feed conversion ratio, flock-wide weight, or biological benchmark claims in this release. Laying rate and feed efficiency can follow once denominators and history coverage are agreed with the pilot farm.

## 8. Minimal domain and API design

Proposed new Prisma models, names to confirm during implementation:

| Model | Responsibility |
|---|---|
| FarmSettings | Tenant/Store scope, enabled state, mode, timezone source, revision |
| FarmFlock | Identity, type, house label, opening/age facts, status, revision |
| FarmDailyRecord + immutable revisions | One flock/local-date identity, current values, author, correction history |
| FarmBirdMovement | Opening, mortality, cull, matched sale, explicit correction/return facts |
| FarmBirdSaleAllocation | Order-line/fulfilment references, flock quantity, correction chain |
| FarmCommandReceipt | Tenant-scoped idempotency identity, payload hash, durable result |

Daily mortality/cull movements link uniquely to the responsible record revision. Summaries use movement facts for bird balance and daily values for production; never add the same death from both sources. Egg posting references existing Stock Operations; do not create another stock ledger.

All farm records carry Tenant and Store scope, including allocation links. Store-local dates are date values; audit timestamps remain UTC. Quantity inputs use decimal strings where divisible and integers for eggs/birds. References to Orders, Catalog, and stock must be checked against the same scope inside the transaction.

Proposed `farm` tRPC procedures:

- `settings`, `updateSettings`.
- `flocks.list`, `flocks.detail`, `flocks.create`, `flocks.update`, `flocks.close`.
- `daily.get`, `daily.record`, `daily.correct`.
- `production.postEggCollection`.
- `sales.unmatched`, `sales.allocate`, `sales.correctAllocation`.
- `reports.summary`, `reports.export`.

Use bounded date ranges, server pagination, shared schemas, repository-owned arithmetic, and safe typed errors. Reads return current authoritative snapshots; no client-loaded-history financial or bird totals. No new jobs or external integrations are required for the first release.

## 9. Permissions

Proposed permissions reuse existing membership roles rather than introducing a new farm login:

| Action | Owner/Admin | Manager | Operator | Cashier |
|---|---|---|---|---|
| Configure/disable module | Yes | No | No | No |
| Create/edit/close flock | Yes | Yes | No | No |
| Read operational flock data | Yes | Yes | Yes | No |
| Record today's production | Yes | Yes | Yes | No |
| Correct/backdate/return birds | Yes | Yes | No | No |
| Post egg stock / match bird sale | Yes | Yes | No | No |
| Read reports/export | Yes | Yes | No | No |

Manager review before stock effects is the first-release control. An Operator recording production does not automatically receive permission to create inventory receipts. Existing order/payment roles remain unchanged. Recheck membership and module status for every command. Customer/Guest access never authorizes farm records.

## 10. Implementation work packages

| Package | Concrete deliverable | Dependency | Exit criterion |
|---|---|---|---|
| P0: Pilot workflow | Confirm crate count, daily entry cadence, flock terminology, who records/reviews | None | One sample layer day and broiler sale agreed |
| P1: Activation | Poultry profile, mode setup, server feature projection, Owner/Admin enable action | P0 | Fresh and existing Stores reach Farm setup |
| P2: Domain | Additive schema, scoped settings/flocks, daily revisions, bird movements, command receipts | P0 | Core commands pass replay/concurrency/scope checks |
| P3: Production/inventory | Transaction helper extraction, egg posting/corrections, explicit Product mapping | P2 | 900-egg example and rollback cases pass |
| P4: Bird reconciliation | Fulfilled-line matching, allocations, correction/return exceptions | P2 | No duplicate farm deduction or over-allocation |
| P5: Mobile | Farm overview, setup, daily entry, post/match, history, missing-record state | P1–P4 contracts | Layer, broiler, and mixed business flows pass |
| P6: Reports/web | Bounded summary/export and dashboard read-only view | P2–P4 | Same source facts reconcile across clients |
| P7: Pilot release | Preview migration/QA, scoped pilot enablement, seven-day trial, fixes | P1–P6 | Pilot exit criteria met |

Existing touchpoints verified during planning:

- `packages/utils/src/business-profiles.json`, `business-profiles.ts`, `business-profiles.test.ts`.
- `packages/utils/src/catalog-setup-helpers.json` for a reviewed egg/crate helper if needed.
- `apps/api/src/schemas/tenant.ts` and relevant onboarding/auth schema tests.
- `apps/api/src/trpc/routers/tenant.ts` and `packages/db/src/queries/workspace-feature-availability.ts`.
- `apps/mobile/src/lib/workspace-feature-availability.ts` and its tests.
- Mobile sign-up, new-business setup, More/Farm entry, and Reports composition.
- `packages/db/src/queries/inventory-operations.ts`, existing Inventory router/schemas/tests.
- Existing Commercial Order fulfilment/return queries and models for allocation eligibility.
- `packages/db/prisma/models/` and the query export surface.
- Dashboard sidebar and route composition for the new read-only view.

New files should form focused `farm` schemas/router/query and mobile component modules. Do not place production logic inside onboarding or generic Catalog components.

During implementation, generate Prisma migrations through the repository workflow; do not hand-write migration files. Root `db:migrate` and `db:push` scripts both exist: run both for the authorized development target after schema updates. Preview/Production database rollout is a separate controlled release step. No database commands were run for this plan.

## 11. Delivery estimate and cuts

Planning estimate for one engineer familiar with the repository: **12–18 engineering days**, followed by **seven calendar days of pilot use**. This is a scope estimate, not a committed launch date; migration access, device/build readiness, and pilot availability affect elapsed time.

- Days 1–4: confirm pilot workflow, activation, schema, flock/daily commands.
- Days 5–8: egg posting and bird-sale allocation with transaction tests.
- Days 9–12: mobile operating screens and focused report/read-only web view.
- Remaining allowance: device QA, correction/return edge cases, deployment and pilot setup.

If speed requires a smaller first pilot, release P0–P3 plus the daily mobile screens first: both flock types can record production, but egg integration is the only automated stock bridge. Keep broiler sale matching and dashboard explicitly marked as next-slice scope. Do not present recorded broiler counts as sales-reconciled until P4 is delivered.

## 12. Acceptance tests

1. Poultry selection produces Layers/Broilers/Both setup; a feed retailer keeps its existing workflow.
2. A configured empty farm displays Farm setup; another business gains no farm write access by changing a client request.
3. An opening flock of 500 birds, two deaths and one cull records 497 remaining; a retried request still records 497.
4. Concurrent/backdated corrections cannot make any historical or current bird balance negative.
5. A layer record with 900 accepted and 12 cracked eggs totals 912 collected; only 900 can be posted to sale stock.
6. Repeated egg posting creates one inventory effect. A failure between stock and farm linkage rolls the whole transaction back.
7. A posted collection correction uses the existing inventory ledger and refuses an unsafe reserved-stock decrease.
8. A 20-crate fulfilled Order at factor 30 consumes 600 eggs through the existing commerce path, with no extra farm deduction.
9. Matching 100 fulfilled birds to a 497-bird flock yields 397 birds; matching does not deduct ready-sale inventory a second time.
10. Duplicate allocations, unfulfilled Orders, cross-Store lines, fractional birds and quantities above fulfilled availability are rejected.
11. Physical bird returns and monetary refunds stay distinct and produce visible reconciliation work where required.
12. A blank feed/weight field remains missing; a zero egg/death count remains an explicit observation.
13. Store timezone boundaries and opening/closing dates produce the right daily uniqueness and missing-record results.
14. Operator, Manager, Owner/Admin and Cashier permissions match the table. Disabled-module writes fail server-side.
15. Offline farm writes are unavailable; existing supported offline checkout still replays normally.
16. Mixed layer/broiler farms get the appropriate forms. Tenant switching clears previous farm state and caches.
17. Reports/CSV agree with repository aggregates beyond a single client page and include missing-history markers.
18. Existing Catalog creation, stock receipt, reservations, fulfilment, returns, payments, and non-farm navigation pass focused regressions.

Run focused unit and database integration tests for these invariants, relevant package type checks, then real API-backed mobile and dashboard verification. This plan itself needs review/readback, not an application test run.

## 13. Pilot and rollout

1. Keep the server rollout switch off by default. Apply the additive migration to the authorized Preview target.
2. Verify a Layers business, a Broilers business, and one business using Both with synthetic records.
3. Enable one consenting design-partner Store. Enter current opening counts and current sellable stock separately; no automatic historical import.
4. Give the owner a short setup walkthrough and assign one daily recorder and one manager reviewer.
5. Operate for seven calendar days. Compare daily notes, egg stock, Orders, and bird-sale allocations with the farm's physical records.
6. Expand only after the acceptance tests and pilot criteria pass. Module eligibility and app release readiness are separate checks.

Proposed pilot exit criteria:

- At least 90% of expected daily flock records completed during the pilot.
- No duplicate egg receipts or bird-out allocations under retries.
- Egg receipts reconcile exactly with posted accepted collections.
- Completed pilot bird sales are matched or explicitly flagged unresolved; no hidden negative bird balance.
- Owner and recorder complete the routine without engineering assistance after the initial walkthrough.
- Remaining issues have clear owners; no unresolved correctness defect in stock, scope, or permissions.

Rollback: disable new farm writes for the affected Store, preserve read access/history, and continue existing commerce. Posted stock effects remain authoritative and require explicit corrections; disabling the module never reverses Orders, payments, or inventory.

## 14. Follow-up releases

**Next: Feed and cost records.** Connect feed receipts and flock issues using confirmed units; add chick/pullet costs and paid farm expenses. Define consumed cost separately from cash spent and make allocation/coverage explicit before calculating cost per egg or bird. Display partial figures as estimates. Do not count a feed purchase and its consumed allocation twice.

**Then: Performance and planning.** Agreed laying-rate and feed-efficiency calculations, flock comparisons, collection lots/age, recurring supply orders, health schedules entered by the farm/vet, reminders, full dashboard editing, and an intentionally designed offline daily-record workflow.

**Separate shared work:** Customer statements, opening debt/deposits, debt reminders, and supplier/purchasing accounts belong to the shared financial domain. They are not prerequisites for this poultry MVP and must not be reimplemented as farm-only ledgers.

**Outside this plan:** Midwifery, crop farming, hatcheries, slaughter/processing yield, disease diagnosis, treatment recommendations, IoT sensors, automated forecasting, payroll, and a universal workflow engine.

## 15. Planning completion checklist

- [x] Existing onboarding/category and feature-access behavior inspected in source.
- [x] Dedicated poultry activation and layer/broiler behavior specified.
- [x] MVP boundaries, workflow, data/API outline, permissions, tasks and acceptance criteria written.
- [x] Pilot, rollback, estimates and follow-up roadmap defined.
- [ ] Application implementation.
- [ ] Preview/device validation and pilot rollout.

No Brain files were read or changed during this planning request. No app code, schema, database, deployment, or feature switch was changed.

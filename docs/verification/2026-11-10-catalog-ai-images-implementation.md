# Catalog AI Images source implementation

10 November 2026. Current checkout only; no push, deployment, hosted policy
change, native build/install, provider purchase or paid sample generation.

## Selected design and behavior

Merchant Workshop direction02 v13 `f6a38263-326e-4e69-8c94-46d39a386e1a` extends
accepted v12 with the owner's allowance-copy correction. Existing immutable
history and parent Catalog form remain intact. Oversight direction01 v7
`c4d1c853-48aa-4449-9d94-bb64fececf81` is selected and its independent source
implementation is commit `7be1ba7` in the existing Oversight checkout.

New and saved items use the same Images body in a full-screen editor. Native
sources are Take photo / Choose / My images; web sources are Upload photo / My
images. Generate uses current Product/Service facts plus an optional note and
adds exactly one approved private image. Refine targets the chosen image, makes
its result default in that slot and preserves the original/version lineage.
Gallery supports original/history, refine again, explicit restore and reviewed
descendant deletion. The normal Catalog save owns attachment/order/illustration
changes. Existing uploads and My images copy semantics remain authoritative.

Lifetime shows only “30 generations left”; monthly appends “this month”.
Allowance is per business, not each staff member. One delivered version consumes
one unit, even if deleted. Failed/undeliverable output consumes no unit; actual
provider cost remains recorded. UTC monthly switching never rewrites historical
usage; pending reservations remain held across period changes. The default is
30 lifetime units, disabled generation, unset provider rates/customer prices.

## Authority, transport and persistence

`catalog.aiImages.state/start/sources/versions/deleteRefinement` are protected,
explicit form-only tRPC procedures. Fresh tenant/store/member and scoped Catalog
permissions precede effects; no assistant tool can spend image credits. Client
inputs cannot set tenant, role, policy, model, cost, approval or output count.
QA businesses cannot enter a live provider. Saved-item facts are server-derived.

`/oversight/ai-images` GET/PUT policy, `/analytics`, `/businesses`, `/usage/:tenantId`
and `/whatsapp` reuse independent read/write keys and the existing read-service
write refusal. Writes require optimistic revision, audited actor/reason and a
stable command UUID; published price/rate IDs are append-only. Unknown requests
have `/requests` and audited `/requests/:id/reconcile`; no reconciliation retries
the provider. Costs surviving a deleted business remain in the account ledger;
orphan receipt reconciliation is available by its known ID, rather than the
business request list. No credentials are stored in policy JSON.

Prisma-generated migrations, applied through the normal Development workflow:

- `20261110203934_catalog_ai_images`
- `20261110204255_catalog_ai_usage_controls`
- `20261110205027_catalog_ai_applied_result`
- `20261110210222_catalog_ai_provider_cost_ledger`

Each schema change ran root `db:migrate --local` and `db:push --local`; final push
reports in-sync and Prisma client generation passes. No handwritten migration,
reset, data-loss override or Preview/Production schema operation was used.

A shared advisory lock serializes policy/admission/reservation/settlement.
`CatalogAiImageJob` is the immutable delivered allowance history and durable
outbox; `CatalogAiImageVersion` stores lineage over ordinary private photos.
`appliedAt` prevents restored originals from being overwritten by old results.
`CatalogAiProviderCost` retains cost and unknown liabilities independently of
business privacy deletion, with no prompt, actor or tenant reference.
`CatalogAiPolicyCommand` stores replayable policy audit. The existing WhatsApp
transport now uses `AssistantWhatsAppMonthlyUsage` under its existing tenant lock,
counting actual outbound send attempts including retries. Minute/day checks stay
in place; monthly cap is configurable even while images are disabled.

Jobs carry only a durable ID. They recheck access/policy before dispatch, invoke
OpenAI once, checkpoint usage before upload, then reuse private upload,
normalization, moderation and settlement. A dispatched crash/timeout is uncertain
and stays reserved for reconciliation; it is never automatically regenerated.
Existing five-minute recovery resumes queued or pending-review results. Revoked
actors release known undeliverable customer reservations without sending again.
Daily spend admission includes retained unknown costs from previous days and
queued reservations. Request/daily amounts reserve estimated cost, not a provider
enforced dollar ceiling. Actual cost uses versioned token rates and usage; absent
usage/rates remains unknown, never zero.

## Configuration and operational limits

Server key: `CATALOG_IMAGE_OPENAI_API_KEY` with existing `OPENAI_API_KEY` fallback.
Normal photo moderation and private storage must also be configured. Policy model
supports the current OpenAI image adapter's allowlist, quality and fixed one-output
request. Text facts/note are untrusted input, never tools or authority. Refinement
uses scoped normalized bytes, not an arbitrary remote URL; responses are bounded
and transport retry is disabled. Default feature policy remains off.

Oversight controls lifetime/monthly allowances, business overrides, pause/roles,
model/quality, estimated cost admission, immutable customer prices/provider rates
and the existing outbound WhatsApp monthly cap. Analytics includes delivered,
failed/uncertain/reserved counts, known and unknown provider costs, latency and
30-day daily series. OpenAI prepaid balance is unavailable unless an operator
records an account/currency/as-of/provenance observation. Forecast stays `no_data`:
feature-only costs cannot establish account-wide runway. No automatic balance
read, credit top-up or customer payment collection is claimed.

## Focused verification

- Root `qa:doctor --offline` passes; source smoke plan inspected before work.
- Provider/contract/API schema tests: 10 pass / 40 assertions.
- Editor result/history and independent Oversight key/write-refusal checks:
  4 pass / 12 assertions.
- Existing real Development Postgres, existing Jawdah QA scope: 2 tests / 15
  assertions pass. Covers concurrent final allowance/monthly-message slots,
  lifetime/monthly history, tenant/QA exclusion, retained unknown cost after job
  removal, and revoked actor queued/review recovery. Transient metadata is
  cleaned in `finally`; no business, sale, payment, message or provider fixture.
- H01 coverage and exact staff permission suite: 16 pass / 113 assertions.
  Generated coverage adds five form-only procedures; H02 impact record accompanies
  schema/API/client/domain/permission changes.
- API typecheck passed. Focused dashboard and mobile TypeScript graphs pass using
  actual app configs and ambient declarations, scoped to owned entrypoints.
  The full dashboard check has an unrelated existing nullable fixture mismatch in
  `shipments/shipment-steps.fixture.tsx:273`; it is preserved, not hidden or fixed
  as part of this change. The first API attempt exceeded the default Node heap;
  its successful retry used a larger heap.
- Owned-path quick smoke: **285 tests / 1,820 assertions pass**, QA tooling
  types and changed-file Biome pass, no unmapped paths. Explicit `--files` scope
  includes only the 62 owned paths and excludes concurrent shared chat changes.
  H02 passes all six touched areas and 13 changed procedure rows.
  Diff/whitespace review passes. This smoke is source-only.
- Existing-data local web `qa:smoke` passes; receipt
  `.scratch/qa-release/smoke-6645533bee2b5b08c9cfa792b293f1cf8bda9f94-local-web.json`.
  This is local source evidence, not a verified Preview/Production candidate.
- Actual signed-in IAB, saved Snail QA7Oct → Images: web sources, optional note,
  30 generations left, default-off AI. New unsaved product → Images opens the
  same full-screen body with no parent form sections; Done returns with name
  preserved. No item was saved. Screenshot:
  `/private/tmp/ewatrade-catalog-ai-images-web.png`.

Native camera/library and paid generation/refinement fidelity have not been
executed. `adb devices -l` has no connected device; host Mac is locked. Native
source/type evidence is not physical-device acceptance. Provider remains off,
so browser checks intentionally cannot prove paid result delivery. Earlier
Workshop gallery/history checks are synthetic design evidence only.

Brain impact check updates local feature, API/contracts/permissions, schema,
relationships/migrations, decision and task status; `.brain` is ignored and not
force-added. The tracked receipt and H02 record carry the reviewable CI context.

## Commit and Workshop receipt

EwaTrade source: `588bc82f4`. Workshop implementation record
`5f77901f-38e8-45bb-8632-e0022952c18e` points at exact merchant v13 and records
source/platform/provider limits above. Oversight source: `7be1ba7`, followed by
copy-only `9a56b5f39` labeling rate-derived amounts “Estimated provider cost”.
That copy change reuses its valid source checks and received a diff/whitespace
review. No new provider call, activation, hosted write, native build or deployment.
Shared `AGENT_CHAT.md` history remains outside this feature's commits.

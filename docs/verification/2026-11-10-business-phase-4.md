# Phase 4 — Public catalog and host-aware sharing

10 November 2026; run ID `2026-11-10-business-phase-4`.
Work began around 12:23 WAT; connected read window completed 12:32 WAT.
Registry-only peer commit `585842939` advanced HEAD during work; owned source
fingerprints below bind the dirty working-tree checks.
Chat `01a1c533-18e6-72f1-91fc-5146451a82b6`; current main checkout,
dispatch baseline `2ecf668cc55775d9731a5afc95c5b5ccded55b47`.
Prior source `040643915`, `92db83673`, `a99965941`, `4a882e82d` and selected
Workshop `storefront/customer-pages`, direction **01 Restrained v6**, revision
`9c481ef9` are retained. No new design or publication was needed.

## Source defect and repair

An authenticated second Store could receive a platform share URL that anonymous
visitors resolved using the first listed Store. `getPlatformProductShare` passed
`trustedStore` into `getPlatformBusinessCatalog`; this restricted nested Store
selection to the authenticated Store even though `/b/<slug>/p/<product>` carries
no Store identifier. The ordinary anonymous route uses the earliest listing time,
then Store ID. The identical URL could consequently show a different Store's
price/contact/availability or an unavailable product.

The existing canonical first-listed resolution now also applies to scoped reads.
After current tenant lookup, a scope mismatch refuses before Site-host or Catalog
projection reads. Canonical Store shares still work. Existing verified custom-host
and Site shares retain precedence. URL shapes, per-Store/per-product consent,
public projection, product/photo guards and domain commands are preserved.

A deterministic inert regression calls the real public catalog loader both with
and without trusted scope. Before repair: nine passing tests and one failure;
wrong scoped Store returned available. After repair the test also drives the real
`getPlatformProductShare` -> `getPlatformBusinessCatalog` chain and requires no URL.
No merchant fixtures, live phone, token or database write is involved.

## Focused verification

- Offline QA doctor: pass; dependency/client presence and nonproduction isolation,
  no runtime/schema/target assertion.
- Explicit owned-path quick plan: core/domain/web/mobile, zero unknown mappings;
  excludes other phases and the pre-existing shared Agent Chat changes.
- Focused query/host/marketing suites: **21 tests / 75 assertions pass** using
  `NEXT_PUBLIC_PLATFORM_DOMAIN=ewatrade.com bun test` with the exact three paths
  `packages/db/src/queries/platform-business-catalog.test.ts`,
  `packages/db/src/queries/catalog-product-share.test.ts`, and
  `apps/marketing/src/lib/platform-catalog.test.ts`.
  Initial host-fixture run inherited the local `.localhost` domain and failed
  three expectations hardcoded for `.com`; the explicit fixture setting passes.
  This changes no runtime configuration. A mistakenly named extra test path did
  not exist; the final command names exactly the three executed suites.
- Whole DB TypeScript initially aborted at Node's default 4GB heap (exit134),
  with no TypeScript verdict. Retry with `NODE_OPTIONS=--max-old-space-size=8192 bunx tsc --noEmit
  --incremental false` in `packages/db`: **pass, exit 0**. This checks the working
  tree; it does not certify other phases or a frozen release candidate.
- Changed-source/impact Biome (three files) and whitespace: pass.
- Four-owned-path quick smoke: **285 tests / 1,820 assertions**, QA tooling types
  and Biome pass; zero unknown mappings. This excludes concurrent work.
- H01: normal validated local-profile `assistant:coverage --check` passes; the
  snapshot is unchanged. H02 initially passed one record with zero capability/procedure
  row changes. A later working-tree run caught a peer shipment impact-record
  schema error and a mid-write peer Brain reference; owners were notified and
  own correction. The real exported `evaluateImpactGate` run with the exact four
  owned paths passes one record / zero row changes. Final owned-commit CLI result
  is recorded in the handoff; global H02 is not foreign-work acceptance.

## Reused proof and remaining acceptance

Earlier exact local listings, search, not-listed/unavailable and verified-Site
redirect checks, plus 375px layout and read-only Owner control rendering, are
reused from the [takeover](2026-11-10-five-phase-takeover.md) and gap-ticket handoff.
They are not repeated or relabeled fresh/hosted proof. Store listing remains on;
Beaded Necklace product visibility remains off. No consent write was authorized.

QA WhatsApp exclusion is intentional: `publicStorefrontWhatsAppPhone` returns null
for QA previews regardless of support phone. Public WhatsApp draft helper checks
pass, but adding a phone to QA cannot prove a live draft button. Existing public
LIVE business contact evidence is needed; no invented number/provider send.

Consent save/refetch, eligible approved-photo delivery and an existing no-site
payment/tracking journey remain separate gates. `p/[code]` delegates to the same
public payment route; service tracking is token-only and has no Site dependency.
That source shape is not a successful existing-record customer journey. Tokens
stored as digests cannot be reconstructed; no new links/orders/payments should be
created merely to manufacture acceptance.

Phase 5 owns shared register/run edits and connected windows. Phase4 acknowledged
its bounded Android source hold, preserved all foreign changes and performed no
native/device operation. The granted exact QA-tenant eligibility window completed
under the normal local profile isolation guard, bounded RepeatableRead transaction and PostgreSQL
`SET TRANSACTION READ ONLY`. The existing tenant was active, not purging and
classification QA. One active/listed/no-published-Site Store was present; there
were **zero approved/current-listed photo candidates**, **zero active no-site
manual-payment links** and **zero active no-site tracking-access records**. Counts
only were returned: no raw IDs were output and no phone, token or digest selected;
no business writes, publication or consent toggle occurred. Phase5 was promptly
notified that the serialized data window was free. No eligibility beyond that
one authorized QA tenant is asserted; no broad tenant scan or fixture was used.

## Brain and assistant impact

Local Brain task `.brain/tasks/2026-11-10-business-phase-4.md` and feature
`.brain/features/product-sharing-public-storefront.md` updated. Both are ignored
local project memory and are not force-added.
No schema, migration, RPC contract shape, staff permission or architecture change;
no database docs or ADR needed. H02 records no assistant impact: this narrows an
existing authorized public/share read, with no new tool/write/channel/rollout.
The Owner/Admin listing forms retain their existing form_only classification.

## Checklist and progress

- [x] Recover committed T8 and exact approved revision; reuse valid prior proof.
- [x] Reproduce and repair canonical Store share binding in current checkout.
- [x] Finish focused checks and Brain impact.
- [x] Commit the coherent owned source/impact/receipt (exact hash in Git history
  and final handoff; no foreign paths staged).
- [ ] Remaining consent/photo/WhatsApp/no-site runtime acceptance.

The stable business register remains **6/72 local passes (8.3%)**, one failed,
47 blocked and18not assessed at dispatch. No launch/phase completion is inferred
from source proof. No push, merge, deploy, paid effect, provider send, publication,
phone/photo/token invention, fixture creation or consent/audience change.

## Owned source fingerprints

SHA-256 at verification (no foreign WIP included):

- `packages/db/src/queries/platform-business-catalog.ts`:
  `f3114455bfdab0799bead00c969f5cbf2fc205b51fc271a56d7f6e16082dfea1`
- `packages/db/src/queries/platform-business-catalog.test.ts`:
  `8df6686d54205539cbcec627c82a93bce2fbe9b93abb96d9baf23fadf06eeeea`
- `bun.lock`: `05bbb4dda2da05b9a80add9e9608e2d2b47f4943c3a0872929c7efe9c58c3348`

Local commit scope includes only these two source/test paths, the owned impact
record and this receipt. Shared `AGENT_CHAT.md`, registry/acceptance files and
foreign scanner/shipment/channel work are preserved and excluded.

# Shopify category standard — local verification

29 October 2026. Owner authorized implementation in current main checkout; no deployment. See the migration contract in docs/plans/2026-10-29-shopify-category-standard.md.

## Delivered behavior

New Dashboard/native category choices use pinned Shopify2026-08 only, including Services; arbitrary-depth drill-down, full-path search, explicit selection/clearing, bounded sibling pages and query caching. Native retains the existing search-footer owner. Old saved/custom/preset classifications remain compatible; no forced backfill. Stable Shopify keys materialize through existing tenant category rows/foreign keys. Unchanged item edits preserve old IDs.

General and Setup/focused Product retrieve compact category keys/paths; selected-category attributes are a separate bounded ID/name read. General reuses category lookups within a turn; prompts discourage repeated retrieval. The three reviewed name recipes now yield Shopify keys. Product/General/Setup prompt versions advance to5/35/14. Local title suggestions no longer invoke the former configured AI provider. No provider configuration was changed.

Public search matches category paths in Prisma paid listings, price-sorted SQL and included-plan post-cap matching. Existing public eligibility, plan cap, tenant/Store scope, price rules and cursor binding remain. Root-category navigation remains root-based; nested storefront category filters are not part of this delivery.

## Evidence in progress

- Offline doctor passes. API/database/dashboard/QA readiness passes using the existing trusted Portless CA.
- Focused initial corrected run:69tests/304assertions pass; includes tree/cursor boundaries, selected attributes, tenant-scoped stable persistence/replay, literal-search wildcard and SQL parity, QA local-only suggestion guards, product preparation and historical compatibility.
- Payload experiment: Rice/Smart Phones/shirts/Eggs category-only model results reduce JSON bytes90–94% (925–1,071bytes), compared with prior category+attribute results. This measures serialized payload, not billed tokens or model quality.
- No live model/provider calls, Prisma schema/database changes, bulk backfill, deployment or native publication.
- Broader checks and UI acceptance will be finalized below before commit.

Brain impact: features/catalog-category-presets.md, features/product-creation-assistant.md, features/storefront-commerce-studio.md, database/schema.md, database/relationships.md, api/endpoints.md, api/permissions.md, tasks/in-progress.md and decisions/2026-10-29-shopify-category-standard.md updated locally. Ignored Brain files are local_only; this tracked report preserves the delivery contract.

## Focused source and UI acceptance

- Corrected focused final suite:93tests/422assertions across15files pass. Owned35-path fast smoke:226tests/1,226assertions across42files, scoped Biome and QA-tooling types pass. This excludes concurrent storefront-content, catalog-detail and marketing changes; it is not a whole-checkout acceptance claim.
- Dashboard TypeScript passes after the separate storefront-content build failure cleared. API types have five unrelated customer-allocation/customer-ledger/product-share fixture diagnostics, zero category diagnostics. Native8GiB compiler has one unrelated order-customer-credit diagnostic, zero category diagnostics. Utils has one unrelated finance-money test diagnostic. The original native/DB4GiB compiler limit is not a source failure; DB follow-up is recorded below.
- H01 generated capability coverage is current in the shared working checkout. H02 shared-worktree check currently reports only five foreign procedure changes (four storefront content operations and qaAccess.fixtureContext removal); this change's capabilities/procedures and documentation decisions are covered.
- Actual in-app browser: verified Services→Professional Services drill-down, explicit Tax Services selection, unmatched search and category-name search. Restored the owner's original unsaved full Eggs path and cleared test search; did not save the item or alter other form fields. Screenshot: /private/tmp/ewatrade-shopify-category-tree.png (private local evidence; not committed).
- Impeccable detector over the Dashboard picker returns no findings. Midday conformance: existing section/form/sheet ownership retained, typed queryOptions, semantic shared controls, loading/error/empty/retry states, bounded pages and debounced search; route/table changes intentionally omitted as unrelated. Native retains the owning floating footer. Native/device interaction and live model-quality evaluations were not run.
- Standard qa:smoke was attempted as required. The first attempt could not launch Chromium inside the sandbox; an approved sandbox escalation launched successfully but the shared Catalog list rendered Something went wrong before reaching item/draft checks. Its failed receipt is smoke-a94ba7317986134ef6ba1b0aa3c3149961f1b428-local-web.json, runtime unverified. No business writes. Final retry after shared build recovery is recorded below.

## Final shared-runtime check

After the shared build recovered, the standard existing-data local web qa:smoke retry PASSED. Receipt `.scratch/qa-release/smoke-a94ba7317986134ef6ba1b0aa3c3149961f1b428-local-web.json` records catalog plus unsaved order-draft/cancel checks. Local runtime identity remains unverified by this tool; this is not Preview/Production release evidence. No sale/payment submission or fixture creation.

The DB8GiB check completes with62 inherited cross-app/fixture diagnostics and zero owned category diagnostics. Dashboard typing passes; the inherited API5/native1/utils1 diagnostics remain explicit. Scoped source acceptance is complete; whole-checkout typing and shared-worktree H02 are not reported green.

Coverage commit ownership: only the category capability/procedure rows and their corresponding summary deltas are staged. The shared working snapshot additionally contains foreign storefront-content additions and a qaAccess.fixtureContext removal; those stay with their owners. H01 was checked against the actual generated shared working snapshot.

## Source provenance

The following hashes pin the tested category code; documentation and generated coverage have their own Git history.

| Owned source | SHA256 |
| --- | --- |
| `apps/api/src/assistant/general-context.ts` | `994b93dc4578b2be72af1a6eca9399556fa437308b1274563f65f2bc58f9902b` |
| `apps/api/src/assistant/general-rollout.ts` | `cc23c91aa338c976ba92d340a77f174131137cdd2e30501da64a822c1be62565` |
| `apps/api/src/assistant/general-service-job-access.test.ts` | `2aad70cc3f6088495185e5e07ad90bc786129ac6d53b582f804ccdf7de97919a` |
| `apps/api/src/assistant/general-tools.ts` | `ef100cc6f8022e7205c49a12342f23a01b670b5d9ccd65458657580e99ba23ee` |
| `apps/api/src/assistant/product-category.ts` | `48c83b5046aaa4e8aec58f6b235f1d137ebdf6af0ba98c0dfb370efd44dda5a9` |
| `apps/api/src/assistant/product-category.test.ts` | `636f73862e1ea900cda1fa4405e9676d57e32e5dfd41f0c8c53de724848968fd` |
| `apps/api/src/assistant/workflow-turn.ts` | `46a5cdf1191d4f5405193b43a032a01e85ab91a101ce7afac1821c39472e03d9` |
| `apps/api/src/catalog/reference-access.ts` | `2eb22dc6893835fc35c099ce8517478f6b2989000069f51a25fb0387b6ddfcd3` |
| `apps/api/src/catalog/category-suggestions.ts` | `426b0e8fcb4984cf03ee2880d51de39f38b3418ce34b5dcfb4ee279ef5c2b921` |
| `apps/api/src/catalog/category-suggestions.test.ts` | `df4aefc4a00d5406972788cef911b68249eec5d4c4b8ce95c24681159e740121` |
| `apps/api/src/trpc/routers/catalog-categories.ts` | `08dc1be8b93b7aec176fc9575194bb844d150c3b17ccb1c3fe244e5b6b2564a8` |
| `apps/api/src/trpc/routers/catalog-category-suggestions.test.ts` | `2e17ad6ccda7a39fcd265c3c34375f27bd0a9044d11a36c0598ef78b684e0c38` |
| `apps/api/src/trpc/routers/catalog.ts` | `a8ed1731badde1c0e9e506ab9ecd7a5ddb4ba4dc1db14527e00679568bbc479d` |
| `apps/api/src/utils/qa-provider-operation.ts` | `c1953154f5d1cce510ff6ef530cb3e24b4509c6f219d9119dc4b84e9342e3b54` |
| `apps/api/src/utils/qa-provider-operation.test.ts` | `d1a661f4018fe128a706930125d74424659a0852c25a5d60667c1cbd58984c4a` |
| `apps/api/src/utils/staff-procedure-policy.ts` | `ffab2d32f84a4277bf7b96d39ec8058cf235349f4d9d89a14a26343d9fe4df85` |
| `apps/dashboard/src/components/catalog-item/catalog-category-editor.tsx` | `aa4097d4b59e3f7754a504f4bce818f3a9620585ec2c7f6b6ba1e2c04e57927b` |
| `apps/mobile/src/components/mobile/catalog-setup/catalog-category-editor.tsx` | `c9b9bc2715247d58847d31aa3a1f377bc97876bdba696f0cb6b76cc432f17641` |
| `packages/utils/src/product-taxonomy.ts` | `4e73b4e1889f44d31ce35fb4008b4a0fac6d2e37086cd64f96a571a654d3d5e0` |
| `packages/utils/src/product-taxonomy.test.ts` | `2247b4458e4da2c4623829a8e5a3478c777edbd9ccb7c03f6db74dd01ba46147` |
| `packages/assistant/src/capabilities/manifest.ts` | `09f2e8f28979d72b7ba9a7f411681e72ccb7a003a19d22158bd0a972474d0a2b` |
| `packages/assistant/src/general/prompt.ts` | `95f8e0aa4022f4b5fa7ff79c2ffd0a18693052c27cf42c4bd192ff23abaa1b5c` |
| `packages/assistant/src/product/contracts.ts` | `5e19241cca8e6f80f59a7f12d4b37563a5cb7fc6f6f4b32dbc3f75a8344c0920` |
| `packages/assistant/src/product/knowledge.ts` | `23745b74f4ef170a12e692d233f43cce8a0bef9a0f2406987ed85bb9f689c328` |
| `packages/assistant/src/product/preparation.test.ts` | `c73ecf71caa631d8f09d34b6daea4f8948e86e9a39f354702324b50684244ca5` |
| `packages/assistant/src/setup/contracts.ts` | `dc0b79dcbb2aa0be5373daac9e55a88cd9aeee1ea8c2d26eb7928504f681d891` |
| `packages/assistant/src/setup/tools.ts` | `2f84e940db65ffb32c319a52b30586a0ea6362651a0c3eb751bac70c21fa8f86` |
| `packages/assistant/src/setup/setup.test.ts` | `01d9897fa80524447548f2f8d90606310c5b0cf460ff5444f960b07173a9a204` |
| `packages/db/src/queries/catalog-categories.ts` | `1fcf76618cc5298e637336181b7ff809d1771d37e5dad5e1855ccc051108f204` |
| `packages/db/src/queries/catalog-category-identity.ts` | `c2318abf367073cc3118f5f0faa060609c8fb56660b2c5cb14d331eb1393ba85` |
| `packages/db/src/queries/catalog-item-update.ts` | `dc0fd36043ddf91697cf649c1527f86633a89459579e274eb761ae0c274835cd` |
| `packages/db/src/queries/catalog-taxonomy-selection.test.ts` | `181e1ad84af35cc5f061fa9feb1b0c7040104a39bf35a11a65a1ff7212b75944` |
| `packages/db/src/queries/public-storefront.ts` | `7c5dfb3ba5329af27cc69e1bbb99c15a024ef5b7d796d8e36da8b60756f02a1e` |
| `packages/db/src/queries/public-storefront-listing.ts` | `b50eff7cbb7653845ae7874de12fff164c18638d490d647545844cb3f115e4b5` |
| `packages/db/src/queries/public-storefront-listing.test.ts` | `c6b82b703bb4bf65b3dd559c76c4c785ac30223f837e7518e92344124f27e4a7` |

Lock SHA256: `387abd6e24dda2ff71913a555ab99db6d487c4a7cf7ed2be38753fba653aabf5`. Final source check timestamp: 2026-10-29T14:02:27.381278+00:00. No deployment.

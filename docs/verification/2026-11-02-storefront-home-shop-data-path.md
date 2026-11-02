# Storefront Home/Shop server data path — 2 November 2026 (Q14)

Scope: the server data path behind Storefront Home and Shop. No dev server, browser
or deploy was used.

## Method

A gitignored harness (`apps/storefront/.scratch/q14/profile.ts` with a `preload.ts`
that emulates the per-request React `cache`) calls the real
`loadStorefrontContextForHost` + `loadFactoryStorefront` path. It runs the shell
frame and the page in parallel, as the layout and page do, for an anonymous visitor.
A wrapped `pg` pool records each query's timing and row bytes.
- Database: local QA database `ewatrade_qa_v1` (remote Neon, about 210 ms per round trip).
- Stores: `sf-flagship-tailor-qa` and `jawdah-poultry-qa-62bf6899-qa` (both on a paid plan).
- Samples: 1 warm-up, then 5 per case; the table reports the median.

A "wave" is a serial round trip: a query that starts after the earliest-finishing
query of the current wave has returned opens a new wave.

## Before → after (commit below)

| Case | Median ms | Queries | Waves | DB row bytes | Resource bytes |
|---|---|---|---|---|---|
| tailor Home | 1299 → 876 | 8 → 8 | 6 → 4 | 20864 | 5288 |
| tailor Shop | 1307 → 889 | 8 → 8 | 6 → 4 | 20864 | 5288 |
| jawdah Home | 1310 → 1072 | 8 → 8 | 6 → 4 | 35374 | 13930 |
| jawdah Shop | 1302 → 1076 | 8 → 8 | 6 → 4 | 35374 | 13930 |

Baseline order: Site → [stock groupBy, 2 offering counts] → available bucket →
sold-out bucket → categories → service request form.

After: Site → [categories, service form, stock groupBy, counts] → available bucket →
sold-out bucket.

Home and Shop use the same loader, so their paths are identical. On jawdah the
available-bucket query took about 420 ms after the change, against about 215 ms in
the baseline, so jawdah's gain is smaller than one round trip per removed wave. This
was measured, not explained.

## Change

In `readPublicStorefrontFromContext`, the category navigation read and the
service-request entry read now start before the listing instead of after it.
- The service entry is still used only when the page shows a service item. An unused
  result or failure is discarded.
- Visibility, plan cap, QA/local-preview gating and cursors are unchanged.
- Cost: one service-form read on paid listings whose page has no service item.

## Not done / follow-ups

- The stock groupBy → available bucket → sold-out bucket chain is still serial (3 waves).
  - Reading the sold-out bucket alongside the available one would save one more
    wave, but over-fetches up to limit+1 rows when the available bucket is full.
  - Folding the groupBy into SQL would also remove a wave.
- Owner-billing coverage (`getRetailOpsOwnerPlanId`) issues no query locally because
  the billing runtime is off, so its production cost after the Site read is unmeasured.
- Pinned-item reads didn't trigger on these stores, because tailor's 2 Home pins are
  already on the page.

Checks:
- packages/db focused tests: `public-storefront*` + `storefront-read-performance`, 47 pass.
- `tsc` for packages/db: clean.
- Biome on the changed file: clean.

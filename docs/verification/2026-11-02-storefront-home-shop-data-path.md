# Storefront Home/Shop server data path — 2–3 November 2026 (Q14)

Scope: the server data path behind Storefront Home and Shop. No dev server, browser
or deploy was used. Dashboard performance work is out of scope.

## Method

A gitignored harness, `apps/storefront/.scratch/q14/`, measured this path:
- `profile.ts` calls the real `loadStorefrontContextForHost` + `loadFactoryStorefront`.
- `preload.ts` emulates the per-request React `cache`.
- The shell frame and the page run in parallel, as the layout and page do, for an
  anonymous visitor.
- A wrapped `pg` pool records each query's timing and row bytes.

Setup:
- Database: local QA database `ewatrade_qa_v1` (remote Neon, about 210 ms per round trip).
- Stores: `sf-flagship-tailor-qa` and `jawdah-poultry-qa-62bf6899-qa` (both on a paid plan).
- Samples: 1 warm-up, then 5 per case; the tables report the median.

A "wave" is a serial round trip: a query that starts after the earliest-finishing
query of the current wave has returned opens a new wave.

## Before → after

| Case | Baseline | After `50d6fdb07` | After `1ba865e80` | Queries | Waves |
|---|---|---|---|---|---|
| tailor Home | 1299 ms | 876 ms | 646 ms | 8 → 8 → 7 | 6 → 4 → 3 |
| tailor Shop | 1307 ms | 889 ms | 651 ms | 8 → 8 → 7 | 6 → 4 → 3 |
| jawdah Home | 1310 ms | 1072 ms | 868 ms | 8 → 8 → 7 | 6 → 4 → 3 |
| jawdah Shop | 1302 ms | 1076 ms | 852 ms | 8 → 8 → 7 | 6 → 4 → 3 |

DB row bytes went from 20,864 to 20,522 for tailor and from 35,374 to 34,289 for
jawdah. Page data bytes are unchanged: 5,288 for tailor and 13,930 for jawdah.

Home and Shop use the same loader, so their paths are identical.

Order of reads at each stage:
- Baseline: Site → [stock groupBy, 2 offering counts] → in-stock bucket → sold-out
  bucket → categories → service request form.
- After `50d6fdb07`: categories and the service form moved into the second wave.
- After `1ba865e80`: Site → [categories, service form, ordered page IDs with Store
  stock, 2 counts] → page re-read by ID.

## Changes

### `50d6fdb07`: independent reads alongside the listing

The category navigation read and the service-request entry read start before the
listing instead of after it.
- The service entry is still used only when the page shows a service item.
- An unused result or failure is discarded.
- Cost: one service-form read on paid listings whose page has no service item.

### `1ba865e80`: bucket order and Store stock in one query

Unsorted paid listings (the default listing and advanced search/availability
without a sort) now read their ordered page IDs from one SQL query,
`publicBucketOrderedIdsSql`:
- It aggregates Store stock per selling unit, matching `publicStockAvailability`:
  exact numerics, and no balance rows means not sold out.
- It orders in-stock items before sold-out ones, then by creation time and ID, with
  a keyset from the cursor's own position.

The page is then re-read by ID through the exact Prisma predicate, as the price sort
already did. This removes:
- the separate stock groupBy;
- the serial sold-out bucket read;
- the serial cursor-row wait on page 2 or later, because the cursor is now validated
  alongside the page.

Nothing is over-fetched: only the page's IDs are re-read.

What stays the same:
- The price sort still uses the groupBy.
- Name and price sorts filtered by availability still use the groupBy.
- Legacy `a:`/`o:` cursors and advanced `s:` cursors keep their format and refusals.
- The SQL shares one eligibility fragment with the price-sorted query; its text and
  parameters are unchanged.

## Parity (old HEAD code vs new, QA database)

This compared the committed listing code with the new code on every published QA
storefront: 9 Stores, 178 comparisons, 0 mismatches. It covered:
- these listings:
  - default listing
  - availability filters
  - search
  - name sort
  - price sort with an availability filter
  - each Store's first 3 root categories, plus their first subcategory
- followed pages;
- a legacy cursor at every item position, with the right prefix and the wrong one;
- refusal of unknown cursors.

Limits: no QA Store has more than one 50-item page, and none mixes in-stock and
sold-out items (the sold-out Store has 2 sold-out items). Cross-bucket ordering is
therefore covered by unit tests, not by real data.

## Jawdah's slower item read (about 420 ms against about 210 ms)

- **Not database work.** `EXPLAIN ANALYZE` of the captured query shows about 2.3 ms
  execution for jawdah and about 0.9 ms for tailor.
- **The jawdah result is larger.** It is about 21 KB (17 items) against tailor's
  about 5 KB.
- **Response size alone reproduces the pattern** on the same connection with a
  1.5 s idle gap before each request (`bytes.ts`):

  | Response size | Round trips | Median |
  |---|---|---|
  | 1–10 KB | 1 | 214–216 ms |
  | 14–30 KB | 2 | 424–426 ms |
  | 45–90 KB | 3 | 635–637 ms |

  Back-to-back requests stay at about 216–221 ms.

This is consistent with TCP congestion-window restart after idle on the remote link.
That is an inference from these measurements, not a packet capture.

Trimming the item select won't fit 21 KB under about 13 KB. The bytes are spread
across many fields, many of them relation keys that Prisma's `relationJoins` adds
itself. So no payload change was made.

## Owner billing plan lookup (`OWNER_BILLING_ENABLED=true`, `STORE_BILLING_ENVIRONMENT=sandbox`)

The QA database has no `OwnerBusinessCoverage` rows. For these uncovered tenants
the lookup adds one serial `OwnerBusinessCoverage` read (about 210 ms) after the
Site query:

| Case | With billing on | Queries | Waves |
|---|---|---|---|
| tailor Home | 866 ms | 8 | 4 |
| tailor Shop | 871 ms | 8 | 4 |
| jawdah Home | 1081 ms | 8 | 4 |
| jawdah Shop | 1090 ms | 8 | 4 |

A covered tenant goes through `readOwnerCoverageSnapshot`, which the code shows
making further sequential reads. That path is unmeasured: there are no QA fixtures
for it, and this task wrote no data.

## Remaining follow-ups (not done)

- Fold the uncovered-tenant coverage check into the joined Site query. Expected
  saving: one wave. This touches the owner-billing seam (`getRetailOpsOwnerPlanId`).
- The Site/context round trip itself is still serial before every catalog read.
- Pinned-item reads (`loadPublicStorefrontPinnedItems`) still wait for the listing.
  On these Stores they issued no query, because tailor's 2 Home pins are already on
  the page.
- Item-page responses above about 13 KB pay an extra round trip on this link.

## Checks

- **packages/db focused tests** (`public-storefront*` + `storefront-read-performance`):
  47 pass, including Q12's category and subcategory tests. The listing, commerce and
  category tests were updated to assert the SQL + re-read path.
- **storefront-templates subcategory tests:** 36 pass (`discovery`, `market-hall`,
  `catalog-listing`, `commerce-studio`).
- **`tsc` for packages/db:** clean.
- **Biome on the changed files:** clean.
- **Not run:** builds, browser tests, deploy, push.

# Sales-rep order visibility — 8 October 2026

Implemented locally on `codex/sales-rep-order-visibility` across API, dashboard
and mobile. No push, PR, Preview or Production rollout.

- [x] Schema: per-Store visibility, change actor/time, shared review timestamp,
  existing Store ALL backfill and new Store OWN default.
- [x] Server: one scope resolver for CASHIER/OPERATOR enumeration, exact-order
  and customer-open-order lookup exceptions, Owner/Admin setting control.
- [x] Dashboard: Home review, Staff/store controls, Your sales and Taken by.
- [x] Mobile: Home NudgeCard, Staff control, Your sales, Store/Mine, search and
  customer lookup; next-sync cancellation/reset preserves queued commands.
- [x] Brain: contract, decision, index, API/database references and task state.

Progress: **5/5 (100.0%)**.

## Verification

| Check | Result |
| --- | --- |
| API/scope/permission/cache tests | 34 pass, 299 assertions |
| Guarded Neon Development integration | 1 pass, 35 assertions; fixtures cleaned |
| Focused dashboard/mobile/helper Biome | Passed |
| Android Metro bundle | Passed |
| Owner dashboard | 13 orders; Keep review and Staff/store setting persisted |
| Cashier dashboard | 3 own orders; exact ORD-013 shows Taken by Owner separately |
| Mobile owner | Review saved, nudge disappeared, Staff rule persisted |
| Mobile cashier ALL | Store includes foreign orders; Mine has ORD-006/007/008 |
| Remote tightening while rep remains signed in | Next sync removes Store/Mine and broad results; only 3 own orders remain |
| Mobile lookup | Exact ORD-013 opens individual value/payment; contact-bearing customer profile lists open orders with Taken by |
| Cross-device review | Mobile choice removed prompt on the owner dashboard |

Full API (8 GiB) and mobile (6 GiB) TypeScript runs exhausted heap before
completion. Full app typechecking is therefore **unverified**. Focused tests and
runtime acceptance do not substitute for that check.

Browser acceptance used `https://ewatrade-dashboard.localhost`. Android used a
fresh Pixel_10a clone, `Pixel_10a_OrderVisibility` (`emulator-5560`), with Metro
3097; the owner requested isolation from Green Till's 3096 and authorized adb
QA. The root local API/jobs/dashboard runtime was retained. The prescribed
unified stack was attempted first, then split because the concurrent mobile
runtime took its port. Neither the shared emulator nor physical phone was used
for final acceptance. The designated Jawdah QA Store was temporarily prepared
as legacy ALL/unreviewed, then left OWN/reviewed using the owner setting control.

Existing scoped-role errors in offline settings, QA fixture context and customer
directory listing/counting were observed and left unchanged. An order with no
customer contact cannot resolve a customer profile; a contact-bearing profile
was used to verify lookup. No unrelated capability was expanded.

## Development database rollout

Prisma generated migration `20261008091528_sales_rep_order_visibility`; generated
SQL was made transactional and backfilled existing Stores to ALL/unreviewed.
Guarded root `db:migrate --local`, `db:push --local` and client generation passed
against Neon Development `ep-royal-dew-awnlogem` / `ewatrade_qa_v1`
(guard identity `6f198191`). No reset or data-loss override was used.

Development already had three assistant migrations absent from this checkout.
A temporary rollout schema/config preserved their exact existing worktree
baseline and omitted unapplied product-analytics schema while retaining root
environment guards. Prisma also applied the pre-existing pending
`20261007120000_lead_capture_signup` migration. Its SQL was not authored or
committed by this feature. Ordinary root migration history must be reconciled
with the assistant branch before a later rollout. Preview/Production untouched.

## Local Brain and screenshot evidence

The repository ignores `.brain/` and `artifacts/` as local project memory. Those
ignore rules are preserved; this committed record makes acceptance reviewable.
Updated local Brain files:

- `.brain/features/sales-rep-order-visibility.md`
- `.brain/decisions/2026-10-08-sales-rep-order-visibility-setting.md`
- `.brain/BRAIN.md`
- `.brain/api/contracts.md`, `.brain/api/endpoints.md`, `.brain/api/permissions.md`
- `.brain/database/schema.md`, `.brain/database/migrations.md`
- `.brain/tasks/in-progress.md`, `.brain/tasks/done.md`

Screenshots in `artifacts/sales-rep-order-visibility/` include
`dashboard-staff-final-own.jpg`, `dashboard-rep-own-list.jpg`,
`dashboard-rep-exact-lookup.jpg`, `dashboard-mobile-review-shared.jpg`,
`mobile-owner-review.png`, `mobile-owner-choices.png`,
`mobile-owner-review-dismissed.png`, `mobile-owner-staff.png`,
`mobile-rep-store.png`, `mobile-rep-mine.png`, `mobile-rep-tightened.png`,
`mobile-rep-exact-search.png`, `mobile-rep-lookup-detail.png` and
`mobile-customer-open-orders.png`.

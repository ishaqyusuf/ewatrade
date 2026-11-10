# Shipment end-to-end QA run — 10 November 2026

Status: **passed after four UI fixes**. Technical test on QA data only, run through
the real local dashboard UI (`https://ewatrade-dashboard.localhost`, Inventory →
Shipments) against the T1 `finance.shipments.*` commands. Owner request: list some
products, add a new product during listing, set prices, and check the outputs are
correct. Not T9 launch acceptance and no launch credit.

## Scope and environment

- Business: **Claude Web Test Farms**, Main store, QA owner profile signed in with
  the dashboard's own QA Quick Fill (domain `ishaq.qa.test`). Writes to this QA
  business were authorised for this run. Jawdah Poultry Acceptance was not touched.
- Local API on 3095: `bun run --hot src/local.ts`, `APP_ENV=local`, started
  10 Nov 11:28 after the T1 commands (`cdcad01bb`); the shipment router has not
  changed since. Fix `6845ba652` only touches dashboard/mobile/utils, which the
  dashboard dev server hot-reloaded (bundle checked for the new code). No shared
  process was stopped.
- DB checks: read-only Prisma scripts run through `scripts/with-workspace-env.mjs`
  (no credentials printed), snapshot before and after every step.
- Phone: emulator-5554 left the session part-way; only a physical phone was
  attached, which was not used. Phone screens are covered by the mounted fixture
  (`apps/dashboard/src/components/shipments/shipment-steps.*`, 10 cases).

## Shipment entered

`QA E2E China consignment`, supplier **Ama Feeds Ltd**, reference `QA-E2E-1110`,
expected 20 Nov 2026. Rate **1 CNY = ₦213.47** ("QA bank rate", 10 Nov). Freight
**CNY 117**, split by goods value.

| # | Line | Mapping | Qty | CNY each |
| --- | --- | --- | ---: | ---: |
| 1 | Layer feed 25kg · Bag | existing | 12 | 61.50 |
| 2 | Grower feed 25kg · Bag | existing | 7 | 58.25 |
| 3 | Egg crates (empty) · Piece | existing | 30 | 3.30 |
| 4 | Poultry drinker 5L | **new product** | 9 | 14.80 |

**New product:** listed on the shipment as "New product (not in Catalog yet)" with
its name. Then added in Catalog → Add item → Goods (₦4,500 per Piece, no opening
stock). In Record arrival it appears under "In Catalog, no stock here yet"; choosing
it calls `inventory.offeringAvailability` (creates the zero Main store balance) and
then `finance.shipments.mapLine`. This path did not exist before this run (bug 2).

## Expected vs actual (kobo unless shown)

Expected values were worked out independently (Python `Decimal`, half-up to kobo,
largest-remainder freight split, ties to earlier line) before reading T1 output.

| Check | Expected | UI | DB | Result |
| --- | --- | --- | --- | --- |
| Goods L1 / L2 / L3 / L4 | 15,754,086 / 8,704,239 / 2,113,353 / 2,843,420 | ₦157,540.86 / ₦87,042.39 / ₦21,133.53 / ₦28,434.20 | same | Pass |
| Freight total (CNY 117 × 213.47) | 2,497,599 | ₦24,975.99 | 2,497,599 | Pass |
| Freight split L1 / L2 / L3 / L4 (2 leftover kobo → L2, L1) | 1,337,660 / 739,066 / 179,442 / 241,431 | ₦13,376.60 / ₦7,390.66 / ₦1,794.42 / ₦2,414.31 | same | Pass |
| Landed L1 / L2 / L3 / L4 | 17,091,746 / 9,443,305 / 2,292,795 / 3,084,851 | ₦170,917.46 / ₦94,433.05 / ₦22,927.95 / ₦30,848.51 | goods+freight same | Pass |
| Landed unit L1 / L2 / L3 / L4 | 1,424,312.166666 / 1,349,043.571428 / 76,426.5 / 342,761.222222 | ₦14,243.12 / ₦13,490.44 / ₦764.27 / ₦3,427.61 | T1 string as expected | Pass (after bug 1) |
| Shipment landed total | 31,912,697 | ₦319,126.97 | — | Pass |
| Draft and confirm add no stock | stock 54 / 14 / 380, no movements | Draft → On the way | EXPECTED, 0 movements | Pass |
| Override: Grower feed to ₦13,600 each | 1,360,000×7 − 9,443,305 = +76,695 | "+₦766.95 … landed total ₦94,433.05 → ₦95,200.00" | adjustment 76,695 + reason | Pass |
| Landed total after override | 31,989,392 | ₦319,893.92 | — | Pass |
| Selling prices Layer / Grower | 1,420,000→1,550,000; 1,380,000→1,490,000 | profit ₦1,256.88 / ₦1,300.00 | offering rev 0→1, CatalogPriceChange prev→new with shipment reason | Pass |
| Old order unchanged | Grower order line 1,380,000 | — | 1,380,000 | Pass |
| Arrival 1: L1 5, L3 30, L4 4 | costs 7,121,561 / 2,292,795 / 1,371,045; bill 10,785,401 | "Part arrived, 39 of 58, still to come 19"; bill ₦107,854.01 | same | Pass |
| Stock after arrival 1 | +5 / +0 / +30 / +4 | — | 54→59, 14, 380→410, 0→4 | Pass |
| Replay the same receive command (same `clientCommandId`) | same receipt, no new stock | — | HTTP 200, same receipt id, 1 receipt, stock unchanged | Pass |
| Arrival 2: rest (L1 7, L2 7, L4 5) | 9,970,185 / 9,520,000 / 1,713,806; bill 21,203,991 | "Arrived, 58 of 58"; bill ₦212,039.91 | same | Pass |
| Final stock | 66 / 21 / 410 / 9 | — | 66 / 21 / 410 / 9 | Pass |
| Bills reconcile to landed | 10,785,401 + 21,203,991 = 31,989,392 | — | each line received cost = landed | Pass |
| Bill ↔ stock history | one movement and PURCHASE_RECEIPT valuation per bill line | Stock history: 6 "Stock in · shipment" rows | sourceCostMinor = bill line amount | Pass |

The three items that already had stock carry no known pooled value before this
run, so their valuation `valueAfterMinor` stays unknown (finance's existing rule
not to invent a cost). The new product's value is exact: 0 → 1,371,045 → 3,084,851.

## Bugs found and fixed (committed by path, with tests)

1. **Crash on any fractional landed unit cost** (`340fbfefc`). T1 returns
   `landedUnitMinor` with six decimals; the record, costs and price views passed it
   to `BigInt` (`Cannot convert 1424312.166666 to a BigInt`). Now rounded half up
   for display and profit (`shipmentRoundedMinor`, unit test).
2. **A just-added product could never arrive** (`2883202e4`, test `571108bea`).
   Without opening stock it had no Store balance, so the arrival step could not
   offer it. Such products are now offered and mapped through their zero Store
   balance (`shipmentUnstockedChoices` unit test; mounted case on both apps).
3. **Adjustment wording did not multiply out** (`04ce2b051`). "+₦109.56 each × 7 =
   +₦766.95" (₦766.92 by hand). Now states the exact change and the unit before/after.
4. **Dashboard arrivals lost their time and used the UTC day** (`067ac5a65`). Every
   arrival showed 01:00. Today's arrival now uses the current time; a past date uses
   local midday (unit test).

Checks: utils `shipments` 13/13 and `shipment-draft` 2/2; dashboard mounted
shipment steps 10/10 cases; dashboard and mobile `tsc` 0 errors; Biome on changed
files.

## Data left in the QA business

Shipment `QA E2E China consignment` (RECEIVED, two bills to Ama Feeds Ltd totalling
₦319,893.92), product **Poultry drinker 5L** (₦4,500, 9 in Main store), stock +12
Layer feed, +7 Grower feed, +30 Egg crates, and new prices ₦15,500 (Layer feed) and
₦14,900 (Grower feed). Nothing was deleted or reset.

## Not covered

- Phone UI on a device or emulator in this run (fixture-only, see above).
- Close/cancel of a shipment, by-hand freight split on a saved draft, and multiple
  currencies in one shipment.
- Supplier payment of the two bills.

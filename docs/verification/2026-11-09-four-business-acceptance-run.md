# Four-business acceptance run (T9)

9 November 2026, Africa/Lagos. Source candidate reviewed:
`8da2b012fcd5025a94882c9e669178ed873d4a2c` (main). This pass reviewed documents
and source only. No runtime, browser, device, database write or provider call
was made. The [72-case register](2026-11-09-business-journey-launch-register.csv)
has the status, evidence and limitation for each case.
[Spec](../plans/2026-11-09-four-business-launch-acceptance-spec.md) ·
[capability audit](2026-11-09-business-journey-capability-audit.md).

## Scorecard

Current, 10 November 2026, after runtime run 1, the T1/T2/T3/T5/T8 commits and
the owner's instruction to keep data-dependent retail cases blocked:

| Business | Passed | Fail | Blocked | Not assessed |
| --- | ---: | ---: | ---: | ---: |
| Jawdah poultry | 5/12 | 0 | 0 | 7 |
| Laundry | 0/12 | 0 | 3 | 9 |
| Hypnos Man Collection | 0/24 | 0 | 23 | 1 |
| Alhaq Tech | 0/24 | 0 | 23 | 1 |
| **Total** | **5/72 (6.9%)** | **0** | **49** | **18** |

The five passes are local-window passes (see runtime run 1). The hosted launch
environment is still unselected, so they do not cover hosted or provider gates.

Earlier attempts, kept for history:

- 9 November document review at `8da2b012f`: 0/72 passed, 34 blocked, 38 not
  assessed.
- 9 November baseline at `7c585d5dd`: 72 NOT_ASSESSED.

## Why nothing passes yet

- **No launch candidate or environment is selected** (spec, evidence rules).
  Without one, no historical receipt can be credited as current.
- **All mapped proof is local QA on older sources.** It ran on synthetic
  tenants: Jawdah Poultry QA, Mama Bisi Farms, FreshCare Demo and Heritage QA.
  It used test OTP, registered synthetic image fixtures, simulated transfer
  reports and expiring QA service policy. The spec says stale or local runtime
  proof cannot pass a case.
- **Most cases also have a gap the old proof never covered.** Examples: the
  repeat collection (J04), the mortality reason rule (J05), a permitted cashier
  sale (J06), any fulfilment (J12), and work photos (L07). The register
  limitation names the gap for each case.
- **Hypnos and Alhaq have no business, catalog or merchant-approved data.** Their
  NOT_ASSESSED cases have no business-specific evidence.

The strongest reusable evidence is the Jawdah storefront journey (J08–J11):
ORD-061, ₦19,500 paid, zero balance, 28–29 October. A rerun on the candidate
should pass it quickly if nothing has regressed.

## Blocked cases and what unblocks them

| Cases | Unblocked by | State at 10 Nov |
| --- | --- | --- |
| L04, L12 | T6 WhatsApp laundry intake (Phase 3) | Still blocked; T6 awaits owner approval of its design cases |
| R04, R05, R06 (H and A) | T5 rich WhatsApp product setup | Landed `082595e9a`; now NOT_ASSESSED |
| R07 | T3 saved-product app/web links | Landed `ed975340c`; now NOT_ASSESSED |
| R09 | T2 QR and scan-to-sale | Landed `0734a5f80`; now NOT_ASSESSED |
| R10–R15 | T1 shipment backend + T4 shipment UI | T1 landed (`36e095785`, `cdcad01bb`); still blocked on T4 |
| R16 | T7 WhatsApp shipment lifecycle | Still blocked; T7 awaits owner approval |
| R18, R19 | T8 no-site public catalog | Landed `92db83673`; now NOT_ASSESSED |
| R23 | **No ticket.** See decision 1 below | Still blocked |
| R24 | T1/T4/T7 and R23 | Still blocked |

## Decisions and risks for the owner

1. **R23 is not covered by any ticket.** On WhatsApp, the catalog sale
   (`sales.order.create`) is `app_review`. The native sale (`record_simple`) is
   money-first and has no stock effect. Either app review counts for R23, or a
   ticket is needed for a native exact-choice WhatsApp sale.
2. **Hosted staff gate.** `STAFF_STORE_ACCESS_ROLLOUT_READY` is true only for
   local/dev/preview APP_ENV with NODE_ENV=development
   (`packages/db/src/queries/staff-store-access.ts`). On a hosted launch
   environment, staff invitations refuse. That would block J01, J06, R01 and the
   role checks in J12/L12/R24.
3. **Testing go-ahead.** The owner instruction of 2 November
   (`.brain/qa/pending-ui-test-ledger.md`) paused UI, browser and device testing.
   On 9 November the owner authorized a local nonproduction data window that
   includes UI testing. Hosted and provider runs still need separate approval.
4. **Returning owner login (found in run 1).** A new owner signs up with an email
   code and never sets a password, but dashboard `/login` only accepts a
   password. That owner can get back in only through "Forgot password". Either
   offer code login on `/login`, or confirm the reset path is the intended one.
5. **Merchant data.** R02/R03 need the merchant-approved Hypnos and Alhaq product
   lists (names, options, prices, opening stock). L01 needs the real laundry
   price list. The spec forbids inventing these.

## Runtime checks still needed

Run each surface once per business. Reuse existing tenants where they fit. Every
row below writes data, so each needs an owner-authorized **nonproduction data
window**. The read-only `qa:smoke` cannot pass these cases.

| Cases | Channel | Role | Data needed |
| --- | --- | --- | --- |
| J01, R01 | Dashboard signup/login; mobile login | New owner; invited cashier/sales staff | Fresh NGN tenant per business; QA-domain emails; plan entitlement |
| J02–J05 | Dashboard catalog/inventory; mobile stock | Owner | Layers/Broilers/Eggs with 30-egg crate; two collections reusing categories; mortality with reason, then a replay |
| J06 | Dashboard + mobile | Cashier | One permitted sale; refusals for Catalog, Inventory, Staff and Finance |
| J07 | Dashboard assistant, mobile assistant, WhatsApp | Owner/cashier | Walk-in and named customer; full and partial amounts; a synthetic receipt photo; a retry |
| J08–J11 | Dashboard, public storefront (desktop + 390px), payment link | Owner; customer | Published Jawdah site; approved images; four-crate request; delivery fee; transfer report and merchant verification |
| J12 | Dashboard, mobile, WhatsApp | Owner, cashier, foreign-tenant user | Fulfil ORD from J10; stock/money/history reconcile; stale review; cross-tenant refusal |
| L01–L03 | Dashboard catalog + assistant; mobile assistant | Owner | Real laundry price list (garment × treatment × size); a saved customer; Jalabia × 20 wash-and-iron |
| L05 | Public service request | Customer | Published laundry service form; preferred time |
| L06–L11 | Dashboard + mobile services | Owner, staff operator | Assign/start/ready/due change; note, problem, photo; complete unpaid; deposit, partial and full payment link; handover/delivery; cancel and retry |
| R02, R03 | Dashboard + mobile catalog | Owner | 50 merchant-approved base products per business with sparse options/brands |
| R08 | Dashboard + mobile catalog | Owner | Codes with leading zeros; duplicate-code refusal; an uncoded product |
| R17 | Dashboard share; public site | Owner; anonymous customer | Published site with a LIVE eligible product |
| R20–R22 | Public site; customer bot; dashboard | Customer; owner/sales staff | Multi-option request; notification; reviewed follow-up; payment link and verification |

After T1–T8 land, the blocked rows add these checks. Shipments (R10–R15) run on
dashboard and mobile, owner role, with a CNY-priced shipment and an explicit NGN
rate. WhatsApp setup and sales (R04–R06, R16, R23, L04) need the WhatsApp
channel. Sending to a real phone is a provider action and needs separate owner
approval. No-site catalog (R18, R19) needs a business with no published site.

## Phase 1–4 watch

By 10 November: T1 backend, T2, T3, T5 and T8 had landed; T4, T6 and T7 had not.
The matching BLOCKED rows moved to NOT_ASSESSED. They still need the runtime
checks above before they can pass.

## Merchant data needed (blocks R02–R09, R17–R22 and L01)

The owner asked on 10 November that retail cases needing merchant product data
stay blocked rather than run on invented data. R01 (business/Store setup) can
run with QA identities, so it stays NOT_ASSESSED.

**Hypnos Man Collection:** about 50 base products covering perfumes (Arabian and
Hausa), body sprays, jalabiyas, eyeglasses, wristwatches and rings. For each one:

- name and category;
- brand, only if real;
- the options actually stocked: perfume volume in ml, jalabiya size, ring size,
  colour;
- selling price in NGN for each stocked option;
- opening quantity per option;
- selling unit (bottle, piece);
- any manufacturer barcode or SKU;
- at least one photo the business owns, and whether it may be shown publicly.

Also needed:

- sales staff names and roles;
- whether the business already has a published site;
- one real or owner-approved example shipment: supplier, currency, unit costs,
  quantities, freight and the NGN rate.

**Alhaq Tech:** the same per-product fields, for wall chargers, power banks, phone
cases and pouches, screen guards, car chargers and USB cables or adapters. Only
the choices actually stocked:

- connector type;
- wattage;
- capacity in mAh;
- compatible phone model;
- cable length;
- colour.

Also: real manufacturer barcodes where the products carry them, and one China
consignment with supplier unit prices in CNY, quantities, freight and the NGN
rate.

**Laundry:** the price list as garment × treatment × size, with a price or
"quote" for each row, including Jalabia wash-and-iron. Also the normal due times
and the staff roles. L02–L11 can run on clearly labelled test-only prices.
L01 needs the real list.

## Runtime run 1: Jawdah dashboard

9–10 November 2026, owner-authorized local nonproduction window. A fresh tenant
was created through normal signup: **Jawdah Poultry Acceptance**, Main store,
NG/NGN, Starter plan. It has an owner and one invited cashier. Test credentials
are kept only in the ignored `.scratch/four-business-acceptance/` folder.

Runtime: the shared API on 3095 had been serving code from 5 November, so it was
restarted three times with `NODE_ENV=development APP_ENV=local`:

- at `040643915`, for J01–J04;
- at `0734a5f80`, for J05 and the J06 sale;
- at `ed975340c` (clean tree), for the J06 API probes.

During the first window the API hot-reloaded uncommitted Phase 1–4 edits, and
some reloads failed with missing-module errors. One loss save failed silently
during that window and was redone after the restart. The dashboard ran
`next dev`.

| Case | Result | What was observed |
| --- | --- | --- |
| J01 | Partial; not passed | Signup by email code saved NG/NGN and an OWNER membership. Cashier invite → QA link → password setup → active. Cashier password login returns 200, and a wrong password returns 401. **Gap:** the owner never set a password, and `/login` only accepts a password, so a returning owner has to use the reset email. That email could not be checked locally. Mobile login was not run. |
| J02 | PASS | Layers ₦5,000 / 500 Bird and Broilers ₦8,000 / 200 Bird saved and still correct after reload. |
| J03 | PASS | Eggs ₦250/Egg plus a Crate of 30 Eggs at ₦7,500, sharing one stock pool; opening stock 60. The sale form priced 1 Crate at ₦7,500. |
| J04 | PASS | Collections of 20 and then 10 eggs, both tagged Made or collected / Row 1 / Morning collection. The second collection picked the saved categories from suggestions. Eggs went 60 → 90, confirmed in the history page and the database. |
| J05 | PASS | Saving without a reason was refused ("Pick what happened."). A loss of 2 with reasons Died and Row 1 was saved once, and Layers went 500 → 498. Retry protection comes from the unique `(tenantId, clientOperationId)` key and the save button being disabled while saving. A deliberate network replay was not run. |
| J06 | PASS | The cashier created ORD-001: 1 Crate + 2 Broilers = ₦23,500, linked to a customer, unpaid. The cashier's menu hides Catalog, Inventory, Staff and Finance, and their URLs redirect. The API also refuses with 403 FORBIDDEN on `inventory.balanceReport`, `inventory.operationHistory`, `inventory.auditExport`, `finance.fiscalCalendar`, `catalog.createSimpleItem` and `retailOps.staffDirectoryPage`. |

ORD-001 is still unfulfilled and unpaid. It is the starting point for J12:
fulfilling it should leave Layers 498, Broilers 198 and Eggs 60.

The "message customer" prompt was dismissed and nothing was sent.

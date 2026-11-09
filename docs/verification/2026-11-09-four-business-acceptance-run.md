# Four-business acceptance run (T9)

9 November 2026, Africa/Lagos. Source candidate reviewed:
`8da2b012fcd5025a94882c9e669178ed873d4a2c` (main). This pass reviewed documents
and source only. No runtime, browser, device, database write or provider call
was made. The [72-case register](2026-11-09-business-journey-launch-register.csv)
has the status, evidence and limitation for each case.
[Spec](../plans/2026-11-09-four-business-launch-acceptance-spec.md) ·
[capability audit](2026-11-09-business-journey-capability-audit.md).

## Scorecard

| Business | Passed | Fail | Blocked | Not assessed |
| --- | ---: | ---: | ---: | ---: |
| Jawdah poultry | 0/12 | 0 | 0 | 12 |
| Laundry | 0/12 | 0 | 2 | 10 |
| Hypnos Man Collection | 0/24 | 0 | 16 | 8 |
| Alhaq Tech | 0/24 | 0 | 16 | 8 |
| **Total** | **0/72 (0%)** | **0** | **34** | **38** |

The previous attempt was the 9 November baseline at `7c585d5dd`: 72
NOT_ASSESSED. This attempt replaces it in the register. The audit keeps the
baseline wording.

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

| Cases | Unblocked by |
| --- | --- |
| L04, L12 | T6 WhatsApp laundry intake (Phase 3) |
| R04, R05, R06 (H and A) | T5 rich WhatsApp product setup (Phase 3) |
| R07 | T3 saved-product app/web links (Phase 1) |
| R09 | T2 QR and scan-to-sale (Phase 1) |
| R10–R15 | T1 shipment backend (Phase 1) + T4 shipment UI (Phase 2) |
| R16 | T7 WhatsApp shipment lifecycle |
| R18, R19 | T8 no-site public catalog (Phase 4); R19 needs it for the no-site mode |
| R23 | **No ticket.** See decision 1 below |
| R24 | T1/T4/T7 and R23 |

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
3. **Owner instruction of 2 November** (`.brain/qa/pending-ui-test-ledger.md`):
   no UI, browser or device testing until the owner says to proceed. The runtime
   checks below need that go-ahead as well as a data window.
4. **Merchant data.** R02/R03 need the merchant-approved Hypnos and Alhaq product
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

At this review, no Phase 1–4 feature commit had landed after `8da2b012f`. When
T1–T8 commits land, the matching BLOCKED rows move to NOT_ASSESSED. They can
pass only after the runtime checks above, on a selected candidate.

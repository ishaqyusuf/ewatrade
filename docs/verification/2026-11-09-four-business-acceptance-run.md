# Four-business acceptance run (T9)

9 November 2026, Africa/Lagos. Source candidate reviewed:
`8da2b012fcd5025a94882c9e669178ed873d4a2c` (main). This pass reviewed documents
and source only. No runtime, browser, device, database write or provider call
was made. The [72-case register](2026-11-09-business-journey-launch-register.csv)
has the status, evidence and limitation for each case.
[Spec](../plans/2026-11-09-four-business-launch-acceptance-spec.md) ·
[capability audit](2026-11-09-business-journey-capability-audit.md).

## Scorecard

Current, 11 November 2026, after runtime runs 1–9, all of T1–T8 landing, and the
owner's instruction to keep data-dependent retail cases blocked:

| Business | Passed | Fail | Blocked | Not assessed |
| --- | ---: | ---: | ---: | ---: |
| Jawdah poultry | 9/12 | 1 | 0 | 2 |
| Laundry | 3/12 | 2 | 2 | 5 |
| Hypnos Man Collection | 0/24 | 0 | 23 | 1 |
| Alhaq Tech | 0/24 | 0 | 23 | 1 |
| **Total** | **12/72 (16.7%)** | **3** | **48** | **9** |

Earlier on 10 November the count was 5/72 passed; J06 moved from PASS to FAIL in
run 2. All case passes are local-window passes (see runtime runs 1–2). A separate
app-first Preview candidate now has a passed existing-data web smoke; it does not
promote these historical case passes or cover merchant/provider gates.

Earlier attempts, kept for history:

- 9 November document review at `8da2b012f`: 0/72 passed, 34 blocked, 38 not
  assessed.
- 9 November baseline at `7c585d5dd`: 72 NOT_ASSESSED.

## Why historical proof is limited

- **The selected app-first Preview scope is narrower than launch acceptance.**
  Exact candidate `5e770dbfe` has current web smoke evidence, but historical
  business-case receipts are not promoted to that candidate by a draft/Cancel run.
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

## Source dependencies and runtime gates

| Cases | Unblocked by | State at 10 Nov |
| --- | --- | --- |
| L04, L12 | T6 WhatsApp laundry intake (Phase 3) | Landed `1e6672a17`; NOT_ASSESSED pending actual channel/role proof |
| R04, R05, R06 (H and A) | T5 rich WhatsApp product setup | Landed `082595e9a`; Hypnos/Alhaq cases remain BLOCKED on merchant-approved data and actual runtime proof |
| R07 | T3 saved-product app/web links | Landed `ed975340c`; Hypnos/Alhaq cases remain BLOCKED on merchant-approved data and actual runtime proof |
| R09 | T2 QR and scan-to-sale | Landed `0734a5f80`; Hypnos/Alhaq cases remain BLOCKED on merchant-approved data and actual runtime proof |
| R10–R15 | T1 shipment backend + T4 shipment UI | Both landed (T4 `27a53202f`, `623e90e8d`); still blocked on merchant shipment data |
| R16 | T7 WhatsApp shipment lifecycle | Landed `1e6672a17`, `6b092d7ca`; still blocked on merchant shipment data |
| R18, R19 | T8 no-site public catalog | Landed `92db83673`; Hypnos/Alhaq cases remain BLOCKED on merchant-approved data and actual runtime proof |
| R23 | **T10 fully native catalog sale**, owner requested plan 10 Nov | Planned; still blocked |
| R24 | T1/T4/T7 and R23 | Still blocked |

## Decisions and risks for the owner

1. **R23 scope resolved: T10 planned.** On 10 November the owner chose “Plan fully
   native WhatsApp sales.” App review does not satisfy R23. Existing
   `sales.order.create` remains `app_review`; money-first `record_simple` does not
   supply catalog stock effects. The [T10 plan](../plans/2026-11-10-whatsapp-native-catalog-sales.md)
   covers exact choices, review/edit/confirm, stock/payment, permission parity and
   retry receipts. No native catalog-sale source or target release exists yet;
   H23/A23 remain blocked.
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

By the Codex takeover on 10 November, T1–T8 had landed locally, including T4,
T6 and T7. The earlier statement that those three had not landed is superseded.
Data-dependent retail rows remain BLOCKED per the owner; other source-unblocked
rows still need the runtime checks above before they can pass. See the
[five-phase takeover](2026-11-10-five-phase-takeover.md) for exact commits and limits.

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
| J06 | PASS in run 1; FAIL in run 2 | The cashier created ORD-001: 1 Crate + 2 Broilers = ₦23,500, linked to a customer, unpaid. The cashier's menu hides Catalog, Inventory, Staff and Finance, and their URLs redirect. The API also refuses with 403 FORBIDDEN on `inventory.balanceReport`, `inventory.operationHistory`, `inventory.auditExport`, `finance.fiscalCalendar`, `catalog.createSimpleItem` and `retailOps.staffDirectoryPage`. |

At the end of run 1, ORD-001 was still unfulfilled and unpaid. Run 2 later
changed J06 to FAIL.

The "message customer" prompt was dismissed and nothing was sent.

## Runtime run 2: Jawdah payment, fulfilment and money

10 November 2026, same local window and tenant. Runtime: API at `ed975340c`
(clean tree), dashboard `next dev`. The storefront was started with the test
OTP adapter (`storefront-qa-otp` launch config). Starting it stopped an older
storefront process on port 3091.

While this run was in progress, Phase 1 left a half-edited
`packages/db/src/queries/finance/shipments.ts` in the working tree. It broke
every dashboard page ("Expected ';'") until Phase 1 repaired it. Phase 5 did not
edit it.

- **J06 → FAIL.** On ORD-001 the cashier's Record payment shows "Payment
  accounts could not load", because `orders.paymentAccounts` returns 403 for
  staff. The procedure is missing from the staff allowlist in
  `apps/api/src/utils/staff-procedure-policy.ts`, though `orders.recordPayment`
  is on it. The cashier role card says cashiers take payments. The cashier's
  full order page also stays on "Loading order…"; the Details sheet works.
- **J12 progress.** As owner: ₦10,000 cash, then Fulfil all (1 Crate + 2 Broilers
  moved once), then ₦13,500 cash into Shop cash. The order is now Paid,
  Fulfilled 2 of 2, with activity entries for creation, payment, fulfilment and
  completion. Stock reconciles exactly to the spec's expected **Layers 498 /
  Broilers 198 / Eggs 60**.
- **Money finding.** Before Finance was set up, Customers showed "Owed to you
  ₦0.00 / Nobody owes you" while ORD-001 had ₦13,500 due. After setting up
  Finance (start date 1 Nov), Shop cash shows only the ₦13,500 paid after setup.
  The ₦10,000 paid earlier never appears. The setup screen says older payments
  aren't brought in, but an owner who sells before setting up Finance sees
  different money in Orders and in Finance.

J12 still needs the mobile, WhatsApp, stale-review and cross-tenant checks. No
customer message was sent; both "message customer" prompts were dismissed.

## Runtime run 3: Jawdah storefront

10 November 2026, same local window. API at `ba4fca6a3` (clean tree). Storefront
ran with the test OTP adapter; every page carried the "Local QA preview · no
messages are sent" banner.

- **New-business store link (J08, R17 finding).** Signup says the free store link
  works as soon as setup finishes. In fact no Site existed and the link showed
  "This shop isn't available". It worked only after the owner started a
  Storefront draft (Commerce studio 1.2.0) and published it.
- **Starter-plan ordering (finding).** On Starter, the published shop lists items
  and prices but has no bag or ordering, because `customerRequestsAllowed` is
  false. J09–J11 therefore ran on the existing **Jawdah Poultry QA** tenant,
  which has a QA Growth entitlement and a published Commerce studio site.
- **J08 (partial).** On the fresh tenant, the two registered synthetic QA PNGs
  were uploaded and the second was made primary. The public page shows that
  primary and both thumbnails, and the photo endpoint returns 200. The
  unavailable/book-ahead policy was not rerun.
- **J09 PASS.** 4 Small Crates = ₦18,000. The customer logged in with a test OTP
  and the bag was kept. Delivery was chosen and request **R-ARCHEP** saved with
  its reference page. Copy issue: the page says you can order "part of a Crate,
  up to 2 decimal places".
- **J10 PASS.** The request reached the merchant's Website requests inbox and the
  bell. Confirm stays disabled until a destination is entered. "Ask for details"
  reached the customer's request page and their reply came back. Destination +
  ₦1,500 fee gave ₦19,500. Confirm created exactly **ORD-062**: Not paid, 4
  Crates reserved. No WhatsApp message was sent.


## Codex takeover: scoped cashier read repair

10 November 2026. Source repair `7f06ca525`, local existing-data browser only.
`orders.paymentAccounts` and `catalog.findByCode` were missing from the exact
scoped-staff query allowlist. Real middleware regressions failed before repair and
passed afterward (24 tests / 129 assertions, including negative authority cases).
The local Jawdah Poultry Acceptance cashier now sees **Received into: Shop cash**
in an unsaved paid-order draft. ORD-001's Details, full page and direct reload
also render correctly; the previous full-page loading failure was not reproduced.
The draft was closed and one existing order remained. No payment/order was saved,
no customer message/provider call was made and no fixture was created.

This is evidence of the repaired read path, not complete J06 payment acceptance.
J06 stays FAIL and the aggregate stays 6/72 local passes. Earlier run failures and
historical evidence are retained. Source types/quick smoke/H01/H02 and standard
existing-data web smoke passed; scope and source fingerprints are in the linked
[takeover receipt](2026-11-10-five-phase-takeover.md).


## Managed phase 5 continuation — 10 November

Original local-window authorization was recovered from the prior phase 5 human
message, 9 November at16:38:11UTC: “Authorize local window.” This covers local
nonproduction runtime/UI acceptance; the current no-fixture-for-smoke, merchant-data,
provider/send, public-consent and release boundaries remain.

Five explicit participant holds pinned HEAD`585842939` and documented peer source
fingerprints for the bounded native run. The window began11:27:33UTC and was
released early at11:31:40UTC after the Android smoke failed its configured catalog
assertion. Initialization and QA sign-in progressed, but the failed, runtime-unverified
receipt earns no acceptance credit. Previous failed runs/history remain intact.

The earlier dependency table described source-unblocked retail rows as NOT_ASSESSED;
that wording is corrected above to match the authoritative register's merchant-data
BLOCKED state. No CSV status or stable ID was changed by that correction.

See the [phase 5 receipt and remaining-action packet](2026-11-10-business-phase-5.md)
for exact scope, independent checks, coordinated windows and outstanding gates.
J06 stays FAIL until saved cashier payment acceptance; T10/R23 remains blocked
until actual native implementation and case proof. Score stays6/72local passes.

Existing-record follow-through at11:32:26UTC: Acceptance ORD-001 is still
COMPLETED/PAID ₦23,500, payments₦10,000+₦13,500 and stock498/198/60 with zero
reservations. QA ORD-062 is CONFIRMED/PENDING ₦19,500, paid0 and an active existing
manual link with no reports. Actual local OWNER dashboard shows matching totals,
four reserved Crates and the service charge; a Create payment link draft was
canceled. No existing public URL was recovered or token reconstructed. No new
link/report/payment/fulfilment/customer send occurred. J11/J12 remain NOT_ASSESSED;
these are persisted-state/read-only observations, not case completion.


Subsequent owner reply in Phase3 selected exact Workshopv17
`d329aac5-7648-450c-a4bd-4218b4a1b36b` and authorized T10 product implementation.
Phase5 independently verified the direct human reply; earlier planning-only gates
above are historical. Source implementation is underway, not accepted. H23/A23
remain BLOCKED and all72statuses remain unchanged; provider/hosted/release stays
separate. Exact provenance is in the current Phase5 receipt.

T10 source integration follow-through (local guarded synthetic domain fixture,
not merchant/runtime proof): cancellation and stale no-effect behavior passed;
the targeted canonical money run passed hard paging preconditions but failed
Finance posting at the unchanged30s root transaction limit. Scoped cleanup and
externalCalls0 passed; frozen source equality verified. Minimal redundant-read
repair is ongoing. [Exact attempts and practical pilot stance](2026-11-10-business-phase-5.md#t10-guarded-source-integration-ledger).
H23/A23 and all other72statuses remain unchanged. No source-only pass or
synthetic test is promoted into merchant/native/provider acceptance.


Final Phase3 checkpoint `c85d5ff4f` is committed but incomplete/default-off. The
post-context/output-composition isolated partial paid check still failed at
`stockOperation.findUnique`,30,751ms against30,000ms (Bun169.22s; outer169.36s).
Cleanup/externalCalls0 and owned restoration passed; no paid/Cashier/replay or
merchant/native/provider acceptance follows. The coordinator stopped the patch/
connected loop. [Latest source checkpoint and compact practical blockers](2026-11-10-business-phase-5.md#final-incomplete-source-checkpoint-and-practical-blockers)
distinguish finished source from the real local paid gate, merchant consent/data
and target dependencies. All72statuses stay unchanged;72/72 is not the only useful
pilot-readiness outcome.

## App-first Preview checkpoint — 10 November, 14:38UTC

Owner-approved Preview rollout of `5e770dbfe955caa6ac38f7cdc11923eb10c022d4`
finished with explicit exit0 for database, Dashboard, Marketing, API, Storefront
and jobs. All six Preview release tags match. Clean fast checks passed 285/1820;
the exact candidate's Preview web smoke passed at 14:38:54UTC with clean:true,
runtimeVerified:true and four checks: QA account, populated catalog, manual sale
draft item/total and Cancel without submit. Phase5 independently validated the
existing receipts, freshness and current config/dependency hashes; no new run.

The native-order gate was OFF in saved Preview API project/linked-shared metadata
before rollout. Native paid/Cashier/replay acceptance remains incomplete; selected
Workshop v17 still has no T10 implementation receipt. This is current scoped QA
readiness, not merchant acceptance. No sale/payment was submitted and no 72-case
status changed: 6 historical local PASS / 1 FAIL / 47 BLOCKED / 18 NOT_ASSESSED. J06 stays
FAIL; J11 stays NOT_ASSESSED. Production/mobile/provider activation was excluded.
The temporary executor worktree was removed and original main/source preserved.
Subsequent receipt commits are documentation, not deployed source. Exact private
receipt paths and limitations: [Phase5 Preview checkpoint](2026-11-10-business-phase-5.md#app-first-preview-rollout-and-smoke--independently-validated).

## Runtime run 4: cashier payment rerun

11 November 2026, same local window. Another session's API was running on 3095
without `NODE_ENV=development`, and its QA capability check failed. It was
replaced with the `qa-api` config at `5826d2bbe`, which includes the cashier fix
`7f06ca525`.

- **J06 → PASS.** The cashier signed in with their password and created ORD-002
  (Walk-in, 2 Eggs, ₦500). They then recorded ₦200 cash, with "Received into:
  Shop cash" offered. The order shows Part paid, ₦300 due, and the activity log
  credits the cashier. The earlier FAIL is kept in history.
- **New finding: stale Store after switching users.** Password login and logout
  never reset the httpOnly `ewatrade.active_store_id` cookie; only QA access
  and owner signup set it. On a browser last used by another business's owner,
  every cashier order and catalog read failed with "Tenant not found", and the
  order form crashed. Selecting the cashier's own Store fixed it. This matters on
  shared shop devices.

## Runtime run 5: Jawdah payment link

11 November 2026, Jawdah Poultry QA tenant, API at `5826d2bbe`.

- **J11 PASS.** On ORD-062 (₦19,500, from request R-ARCHEP) the owner created a
  fixed ₦19,500 manual link with reference EWA-2ACSJ7RYCY. The earlier 24-hour
  link had expired. The customer page showed the amount, the fictional QA bank
  details and the reference.
- Tapping "I have paid" created one report in Payments to check and left the
  order Unpaid. The owner set the received amount, ticked the bank check and
  recorded the payment once; the review warns it "can't be recorded twice".
- ORD-062 is now **Paid, balance ₦0**. The customer page shows "Payment
  confirmed", and Payments to check is empty.
- No real transfer, gateway or bank check was involved.

## Runtime run 6: Jawdah availability policy and J01 status

11 November 2026, API at `5826d2bbe`.

- **J08 PASS.** On Jawdah Poultry QA Eggs, turning on "Mark as unavailable" and
  "Allow book ahead" made the public page show "Sold out now: request ahead",
  with a preferred date described as a preference, not a reservation. Both
  settings were then restored ("Website follows your stock"). The image half
  passed in run 3 on the fresh tenant.
- **New finding: missing photos.** The same Eggs item now shows "Try image again"
  in Catalog, and an illustration publicly instead of its 29 Oct approved
  photos.
- **J01 → FAIL.** Setup, the saved NG/NGN Store, the plan and the staff identity
  pass. The failure is returning-owner login: `/login` is unchanged and still
  only accepts a password, while signup never asks for one. Recommended fix:
  offer code sign-in on `/login`, or ask for a password at signup.

## Runtime run 7: laundry dashboard

11 November 2026, Heritage Wash & Care QA tenant, API at `5826d2bbe`. The job used
the clearly labelled test-only service "QA Laundry lifecycle — synthetic"
(₦1,000). L01 stays blocked on the real price list. Customer updates were set to
"Don't send", and nothing was sent.

- **L02 PASS.** New job for a new synthetic customer: 3 items, due 12 Nov 15:00,
  a team note and a ₦1,000 cash deposit. It created **ORD-006**, Not started,
  ₦2,000 to pay.
- **L06 PASS.** The job was assigned, started, and its due date moved to
  13 Nov 12:00 with a reason. The history shows each step. Only an Owner exists
  on this tenant, so staff-permission limits were not exercised.
- **L08 PASS.** Ready → Complete job warned "₦2,000 remains outstanding" and
  completed; payment was unchanged.
- **L07 FAIL.** The note and the Delay problem were saved, but "Add a photo" has
  no file upload, only a description and an external file reference. Customer
  tracking is covered under L05.
- **L10 FAIL.** After completion there is no collection or hand-over action,
  even once fully paid. `handedOffAt` stays null and there is no delivery
  option.
- **L05 BLOCKED (policy gate).** The tracking link can be created, but every
  `/service-tracking` page, including the 21 Oct FreshCare link, shows "This
  shop isn't available". Public tracking and service requests need a live
  Service Commerce policy decision. Heritage has none, and FreshCare's QA policy
  expired on 29 Oct. The dashboard still offers the link.
- **L09 not passed.** Deposit, ₦500 part-payment and ₦1,500 settlement all
  recorded, and the order is Paid. The customer notification is a provider send
  and was not authorized.
- **Copy finding.** The laundry note and problem placeholders show poultry
  examples ("Vaccinate the layer pen first", "20 birds missed").

## Runtime run 8 — J07 and L03 Assistant

11 November 2026, 16:26–16:37 WAT. The local API on port 3095 and Dashboard
on port 3094 started from `a284ac2aeb7edd71c5418eaed9a234ac93ed2316`.
The owner approved DeepSeek `deepseek-flash` at `api.deepseek.com` for
synthetic QA prompts and their relevant QA context. Dashboard used the existing
Jawdah Poultry Acceptance and FreshCare Demo QA owners. Mobile results below
come from authenticated requests through the mobile API transport. Android
started and passed the development connection check. Device interaction and
WhatsApp delivery remain unverified.

| Case | Dashboard | Mobile API |
| --- | --- | --- |
| J07 | **ORD-003** saved as Walk-in, ₦20,000 total, ₦5,000 cash, ₦15,000 due. The receipt survived reload. **ORD-004** saved for the selected QA customer, ₦12,000 cash, ₦0 due. Each order has one payment into Shop cash. The saved order Activity shows the synthetic PNG and the stored digest matches the source attachment. | The invited cashier's simple-sale turn ended with `STREAM_FAILED` and “Reply interrupted.” It created no proposal. The sale capability currently admits Owner, Admin and Manager. |
| L03 | DeepSeek completed two steps with 118,665 recorded tokens. The review matched the saved customer and 20 Jalabia · Wash & iron at ₦400 each. One confirmation saved **ORD-009** with one confirmed intake and one linked job, ₦8,000 outstanding and no notification. **Created / Open job** survived reload and opened the original job. | DeepSeek returned the same quantity, service and price after five steps and 242,928 recorded tokens. It drafted `order_create` instead of a service intake. The test cancelled that draft through the same API and verified that order and payment counts stayed constant. |

J07's six successful Dashboard turns and failed cashier turn recorded zero model
steps. The simple-sale handler processed the sale text and account/customer
choices before model dispatch. The walk-in confirmation replay through
`assistant.decideProposal` returned the identical canonical receipt, with order
and payment counts unchanged. The synthetic upload remained `UPLOADED` until the
existing attachment handler was run for that exact local QA image. The file then
became `READY` and the normal chat and order flows retained it. Automatic
attachment processing did not pass.

**J07 FAIL.** The owner Dashboard save and replay were verified. The required
cashier path failed, and native UI and WhatsApp remain unverified.

**L03 FAIL.** The Dashboard path passed on FreshCare's saved QA price list.
The mobile API offered a different action and did not create an intake or job.
The required mobile experience remains unverified on device.

The 9 November entries recorded older Mama Bisi web/backend evidence for J07
and an earlier FreshCare ORD-006 receipt for L03. Both were initially
`NOT_ASSESSED` in the launch register. Those historical references remain
alongside this local result.

## Runtime run 9 — J07 and L03 repair

11 November 2026, repair committed as `d79dd1472`. Local Development used existing synthetic Jawdah Poultry
Acceptance and FreshCare Demo profiles. The standard mobile Assistant HTTP
transport used a fresh loopback API on port 3195. This avoided a shared API
process that had failed to reload after a concurrent Prisma generation.

- **J07.** The assigned cashier recorded **ORD-005** as Walk-in with ₦5,000
  cash on a ₦20,000 sale, and **ORD-006** for the selected saved customer with
  ₦12,000 paid in full. Each order has one Shop cash payment and the cashier's
  actor ID. Two concurrent PUTs of the same verified synthetic photo returned
  `READY` for the same attachment. The row had zero processing attempts. The
  saved ORD-006 attachment digest matched the upload. Both confirmation replays
  and reopened chats returned the original receipts. Sale turns had zero model
  steps. The permission change covers same-sale payments using an existing
  account. Standalone Assistant payment, Finance setup and new-account
  creation retain their own authority.
- **Photo retry hardening.** A second fresh local API on port 3196 verified two
  concurrent uploads and a protected read of the original bytes after the final
  retry change. The unused test attachment was removed.
- **L03.** Live DeepSeek Flash used the service job preparer in two steps
  (92,182 recorded tokens) and produced one `service_intake` proposal. One
  confirmation created **ORD-010**, one confirmed intake and one linked job.
  The saved customer and 20 Jalabia · Wash & iron at ₦400 each survived
  confirmation. The total was ₦8,000, paid ₦0, with no customer notification.
  Reopening the chat and reading the protected intake returned the original
  receipt. Replaying confirmation returned the same result.

These checks resolve the specific local failures in run 8. The launch rows
return to **NOT_ASSESSED** pending native UI evidence and the remaining J07
WhatsApp checks. Run 8 retains the original failures and Dashboard receipts.
The unsaved drafts from the initial repro attempts were cancelled.

Scoped fast verification passed 285 tests and 1,820 assertions. The focused
Assistant, staff policy, channel, mobile receipt and booking suite passed 244
tests and 1,936 assertions. API and Assistant type checks and both coverage
and impact gates passed. Five failures in
the broader phase fixture suite also reproduced on the archived baseline
`ed3e7f29b`. They concern D04 timestamp attribution, native money rendering,
native cash/day navigation, the raw Service payment fixture and the Service
Request tool fixture. Lockfile SHA-256
`d46df37ad728068b27917a729b0dde05013583519c802c51a7ee5c615e0d9f65`.

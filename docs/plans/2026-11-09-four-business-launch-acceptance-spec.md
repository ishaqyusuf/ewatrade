# Four business journeys: launch acceptance specification

Date: 9 November 2026, Africa/Lagos. Status: locally specified; implementation
and operating acceptance remain separate. Owner requests local artifacts only:
no GitHub issue, deployment, business setup, provider action or live test is
authorized by this specification.

## Problem Statement

The owner needs a practical launch metric: can four representative businesses
run their complete business on EwaTrade? Jawdah poultry and laundry are existing
cases. Hypnos Man Collection and Alhaq Tech add large mixed catalogs, product
variants, manufacturer codes, imported stock and WhatsApp operations. Individual
screens, source tests and historical successful slices do not establish that
these businesses can finish their journeys on the intended launch version.

## Solution

Maintain four complete journeys, an evidence-backed capability audit and one
launch scorecard. Reuse existing Catalog, Offerings, Inventory, Orders, Service
work, Finance, storefront and assistant commands. Add the missing capabilities
through those domains. The owner confirmed complete owner/customer journeys
across dashboard, mobile, WhatsApp and public links as the acceptance approach.

Companion artifacts:

- [Source capability audit](../verification/2026-11-09-business-journey-capability-audit.md).
- [72-case launch register](../verification/2026-11-09-business-journey-launch-register.csv).
- [Existing Jawdah storefront specification](jawdah-storefront-end-to-end-spec.md).

This specification records requirements; it does not assert that missing features
exist, authorize changes to merchant records, or promote old release roadmaps.

## Four complete business journeys

### B01 — Jawdah poultry

1. Owner completes normal business/account setup with the correct country,
   operating currency, Store, permissions and plan. Staff use their own accounts.
2. Add layers, broilers and eggs. Birds count individually. Eggs can share one
   stock pool with an explicitly configured crate conversion, such as 30 eggs.
   Keep packaged products distinct when their stock is actually separate.
3. Receive egg collections with reusable operation categories; record bird
   mortality with a reason. Inspect stock and immutable operation history.
4. Record counter/WhatsApp sales using the exact item, offering, unit and quantity,
   or use the existing money-first sale for an explicitly uncatalogued sale.
   Support Walk-in or an identified customer, unpaid/partial/full payment and
   optional receipt evidence. A receipt photo is not proof of payment or OCR.
5. Publish approved product images and availability through the normal storefront
   lifecycle. A customer browses, chooses four crates, retains the bag through
   login, selects pickup or requests delivery and submits one request.
6. Merchant receives the request notification, verifies availability and delivery
   details, reviews the final charge and confirms through the canonical Order
   workflow. A preorder date is a request, not a reservation or confirmed booking.
7. Customer opens the correct order/payment link, pays by the configured method,
   and receives the resulting status. Manual transfer evidence requires merchant
   review; uploading evidence does not mark an Order paid.
8. Fulfil once, reconcile the remaining eggs/birds, payment/debt and activity.
   Verify cashier permissions and duplicate/stale retries across the journey.

Historical examples are evidence inputs, not one merged test account. The older
3 October scenario starts Layers 500 / Broilers 200 / Eggs 60, receives 20 + 10 eggs,
records 2 layers lost, fulfils 1 crate and 2 broilers, and expects 498/198/60.
The newer storefront case orders 4 crates. Do not apply both expectations to the
same opening balance without recording the actual additional receipts/sales.

### B02 — Laundry

1. Owner sets up the business, Store, service permissions and real price list.
   Model services using garment × treatment × size choices, including Jalabia
   wash-and-iron. Unpriced work follows the existing request/quote workflow.
2. Receive a customer request at the counter, through the assistant/WhatsApp or
   eligible public service entry. Match a saved customer or explicitly create a
   new one. Record quantities, intake evidence, notes and requested due time.
3. Resolve exact saved service choices and prices, clarify omissions, review the
   total and create the canonical intake/Order/job once. A prepared assistant
   card becomes Created/Open job only after a durable saved result exists.
4. Assign work, start it, track progress, notes, problems, photographs and due
   changes. Staff only act within their current Store and work permissions.
5. Mark ready work completed independently of payment. A completed unpaid job
   remains owing. Customer collection/handoff is a separate action.
6. Notify/message the customer through the existing reviewed channel; share the
   scoped tracking/payment link. Record a deposit, partial payment or settlement
   through canonical payment authority and retain the correct outstanding amount.
7. Hand over/arrange delivery using the normal eligibility checks. Reopen the
   original receipt, Order, job and activity; verify cancellation/correction,
   stale review, duplicate retry and cross-business refusal without losing history.

These steps consolidate previously scattered records. The existing native
assistant preparation and service editors do not prove a complete WhatsApp
laundry intake/save/work lifecycle. That remains an explicit gap.

### B03 — Hypnos Man Collection

1. Set up the business and Store with an owner and appropriate sales staff.
2. Prepare about 50 base Products spanning Arabian/Hausa perfumes, body sprays,
   jalabiyas, fashion eyeglasses, wristwatches and rings. Review suggested names,
   categories and possible options against what the business actually stocks.
   Suggestions must not invent stock, merchant prices, brands or licensed images.
3. Add photos and supplied name, size/options, price, opening quantity and optional
   SKU/barcode. Examples of possible options are perfume volume, jalabiya size
   and ring size; only create combinations the merchant confirms. A perfume
   volume is normally a separately stocked choice unless the business explicitly
   sells measured quantities from a shared pool.
4. Do the same through WhatsApp using text/photos and clear image-to-item mapping.
   Review and confirm supported bounded batches, resume to 50 without re-entry,
   correct a draft, and receive exact saved results and private Open product links.
   Full WhatsApp acceptance requires saving the photo/variant product there;
   an app handoff is useful recovery but does not pass that requirement.
5. Open the saved Product in the authenticated dashboard or installed app, inspect
   its codes and associate an existing manufacturer code if supplied. At sale
   creation, scan a supported code to find the exact offering, or search manually.
6. Name an incoming shipment, list expected products/variants and quantities,
   enter purchase prices and the shared shipping charge, and review calculated
   unit/line totals. Edit proposed landed costs and selling prices separately.
7. Confirm actual arrival; inbound only received quantities through canonical
   Inventory/Finance ownership. Retain shipment, receipt and cost provenance.
8. Share either a product on its published business site or a platform-hosted
   product/business catalog when no custom/generated site is set up. Customers
   can browse that business's other eligible products in either experience.
9. Accept website/customer-bot requests, receive notifications, review the Order,
   message the customer and share its payment link. Also record counter and
   WhatsApp sales. Reconcile stock, money owed/paid and all saved activity.

### B04 — Alhaq Tech

1. Set up the business/Store and accessory catalog: wall chargers, power banks,
   phone cases/pouches, screen guards, car chargers and USB cables/adapters.
2. Record actual brands and supported choices such as connector type, wattage,
   capacity, compatible phone model, cable length and color where applicable.
   Do not generate a full Cartesian grid of unsupported combinations or assume
   compatibility from an image. Use manufacturer codes when present.
3. Exercise the same photo/text WhatsApp setup, saved links, exact code lookup,
   sales, sharing, customer requests, notifications and payment journeys as Hypnos.
4. Name an import shipment, for example an expected China consignment. Record
   the supplier's actual unit prices/currency per line, expected quantities and
   shipping charges. Enter explicit conversion rates to NGN for the shipment;
   show source amount, rate, converted goods cost and allocated freight.
5. Review/edit calculated landed costs and separately set selling prices. Do not
   change old Orders or historical costs. Receive actual quantities, including
   partial arrivals, exactly once; keep outstanding quantities visible.
6. Scan a charger/power-bank/case code while creating an Order, select quantity,
   review payment/customer details and save. Website and customer-bot requests
   reach the same canonical Order/stock/payment authorities as merchant entry.
7. Reconcile shipment totals, received stock, current selling prices, outstanding
   supplier/customer balances where applicable, and accessible activity records.

## User Stories

1. As the owner, I want four complete business journeys so I can judge launch readiness by business outcomes.
2. As the owner, I want missing implementation separated from missing proof so a successful source test cannot hide a blocked journey.
3. As a poultry merchant, I want birds and egg/crate units so my stock reflects how I operate.
4. As a poultry merchant, I want repeat collections and mortality reasons so my stock changes remain explainable.
5. As a poultry cashier, I want permitted sales access so I can sell without access to stock management or Finance administration.
6. As a laundry owner, I want garment/treatment/size pricing so I can record the actual work requested.
7. As a laundry attendant, I want customer intake, quantities, evidence and due times so I can track each job.
8. As a laundry attendant, I want assignment and progress history so unfinished work remains visible.
9. As a laundry owner, I want completed work and money owed tracked separately so unpaid completion remains accurate.
10. As a customer, I want scoped tracking and payment links so I can follow my own job and balance.
11. As Hypnos's owner, I want a reviewed 50-product starter catalog across my collections so setup covers my actual range.
12. As Alhaq's owner, I want brands and compatibility choices so customers select the accessory that fits their device.
13. As a merchant, I want optional real variants so sizes, capacities and prices do not become duplicate unrelated records.
14. As a merchant, I want photos matched to the correct item so a batch cannot swap product images.
15. As a merchant, I want WhatsApp to collect names, sizes, quantities and prices so I can prepare products conversationally.
16. As a merchant, I want exact draft review, correction and confirmation so the AI saves only what I authorized.
17. As a merchant, I want resumable batches so I can reach 50Products without losing earlier work or creating duplicates.
18. As a merchant, I want WhatsApp to save photo/variant products so routine setup can finish in the same channel.
19. As a merchant, I want final saved-product links so I can inspect and manage the exact record.
20. As a mobile owner, I want supported links to open the installed app with web fallback so I can continue on my device.
21. As a merchant, I want optional manufacturer barcodes/QR payloads associated with exact offerings so I can identify products quickly.
22. As a cashier, I want scanning during sale entry so I select the correct item rather than type its name.
23. As a cashier, I want unknown/ambiguous scans and camera refusal handled so I can recover by manual search.
24. As an importer, I want named shipments and expected items so I can distinguish what is ordered from what arrived.
25. As an importer, I want foreign purchase currencies and explicit shipment rates so I can calculate NGN costs.
26. As an importer, I want total freight allocated across items so unit costs include the shipment's shipping expense.
27. As an importer, I want an editable cost review and separate selling prices so I can make informed pricing decisions.
28. As an importer, I want partial receipts and safe retries so stock increases only for goods actually received.
29. As a merchant, I want shipment and price history so a new shipment does not rewrite older sales or receipts.
30. As a merchant with a published site, I want product links to use my eligible business site so customers can browse my catalog there.
31. As a merchant without a published site, I want a platform product page and browseable business catalog so I can still share and sell.
32. As a merchant, I want central scoped order/payment links so customers can complete the correct order regardless of site setup.
33. As a customer, I want exact choices, price, availability and a retained request so online ordering matches the business catalog.
34. As a merchant, I want deduplicated new-order notifications so requests reach the correct authorized staff.
35. As a merchant, I want reviewed customer messages and payment links so I can follow up without the AI claiming money arrived.
36. As a merchant, I want WhatsApp sales to use the same Orders, stock and payment rules so every channel reconciles.
37. As a merchant, I want records/history available in the dashboard and app so I can audit the work done through WhatsApp.
38. As a business owner, I want current tenant/Store/role checks so links, scans and old drafts cannot expose or modify another business.

## Implementation Decisions

- This is a local planning deliverable. Preserve the existing Brain authority,
  domain vocabulary and prior journey records. No runtime/API/schema change is
  made in this task. The tracker choice is local documents only.
- Use existing Catalog Items → Sellable Variants → Offerings → Inventory units
  and balances. Count 50 base Products separately from their sellable variants.
  Product-mode WhatsApp currently has a three-draft review limit; satisfy the
  catalog target through resumable bounded batches or a separately specified
  import expansion, never an undocumented limit bypass.
- Keep merchant assistant and customer commerce bot identities separate. All
  channel adapters remain thin and use current server-derived principal,
  tenant/Store/Book scope, entitlements, canonical commands and durable receipts.
  Interpret → clarify → review → explicit confirmation → save → durable result.
- Incoming photos are untrusted. Reuse private media, upload/review/publication
  authority and explicit item mapping. Do not infer an actual supplier price,
  stock quantity or authentic brand from a generated suggestion or image alone.
- A scan is product identification, not order creation or payment confirmation.
  Associate codes with exact existing offering/unit identity, preserve leading
  zeros and existing per-business uniqueness. An arbitrary QR URL must not be
  followed or treated as authority. Add QR decoding: the current camera allowlist
  supports one-dimensional barcodes, not QR. Optional codes remain optional.
- Add shipment orchestration over the existing supplier purchase, receipt and
  cost boundaries; do not introduce a second stock or money ledger. Draft and
  expected goods do not increase available stock. Separate receipt, ownership,
  invoice and payment facts; route corrections through their source owner.
- Keep original money/currency, explicit decimal rate direction and provenance,
  converted goods cost, freight allocation, landed cost and selling price
  distinct. Use exact decimal/minor-unit arithmetic and deterministic residual
  allocation. Historical rates and completed records never follow today's rate.
- Proposed first allocation rule: proportional to converted goods value, with
  reviewed explicit per-line allocation overrides. Zero total goods value needs
  explicit allocation; do not divide by zero or invent weights. This is a
  planning recommendation requiring resolution before its implementation slice.
- Proposed first FX source: a merchant-entered shipment rate, expressed as NGN
  per 1 source unit, with one explicit rate for each source currency present.
  Preserve rate date/source. Automated market-rate feeds are not specified.
- Apply reviewed new selling prices prospectively through canonical revisioned
  price changes. Receive stock/cost through their existing transaction ownership;
  never replace the current balance cost with the latest unit cost arbitrarily.
- Private management links require normal login and current scope. Public product
  links expose only explicitly eligible catalog facts; public order/payment links
  retain scoped opaque access. Installed-app routing must be proved with normal
  web fallback; a dashboard URL alone is not native deep-link acceptance.
- Existing generated product sharing uses a business subdomain and published
  Site/release. The no-site business catalog is a new capability; it must not
  fake a Site/release or auto-publish private internal Products to get a URL.
  Business-site selection must resolve a verified current host for that Store.
- Domain spelling requires confirmation: the spoken requirement says
  `ourtrade.com`; the configured project platform is `ewatrade.com`. Examples
  describe route semantics, not an approved domain migration or final URL path.
  Central order/payment access remains required in either business-site mode.
- Before future UI implementation, revise the affected implemented Workshop
  design in place, preserve exact history and record owner approval. WhatsApp
  cases use stable case IDs/append-only versions and the same private review
  mirror. This planning task does not publish either design surface.

### Shipment calculation example

Illustrative acceptance data, not a real supplier quote or current exchange rate:

| Line | Expected quantity | Source unit cost | Rate | Goods NGN | Freight share NGN | Landed unit NGN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Chargers | 10 | CNY 20 | NGN 200 / CNY 1 | 40,000 | 4,000 | 4,400 |
| Power banks | 5 | CNY 80 | NGN 200 / CNY 1 | 80,000 | 8,000 | 17,600 |
| Total | 15 | CNY 600 total | pinned | 120,000 | 12,000 | 132,000 total landed |

If the owner changes the charger landed unit cost to 4,600, the extra 2,000 must
be shown and attributed as a reviewed adjustment; it cannot silently disappear
from allocation reconciliation. Selling prices such as 6,000 and 25,000 are
separate prospective prices. Confirm the intended cost-adjustment treatment
before implementation; neither source facts nor old Orders are overwritten.

### Proposed starter catalog composition

These are fixture plans to review, not permission to seed business data.

| Business | Proposed base Products | Count |
| --- | --- | ---: |
| Hypnos | Perfumes 20; body sprays 6; jalabiyas 6; glasses 6; watches 6; rings 6 | 50 |
| Alhaq | Wall chargers 10; power banks 10; phone cases 10; screen guards 8; car chargers 4; USB cables/adapters 8 | 50 |

The owner requested about 50 for Hypnos. Matching 50 for Alhaq is a proposed shared
stress target, not a claim the owner supplied an exact Alhaq inventory. Actual
names, prices, sizes, brands, photos, currencies and opening stock need merchant
input/approval. Options create additional SKUs and do not inflate the 50 count.

## Testing Decisions

Test externally observable business outcomes through the highest existing seam:
an authenticated owner/customer journey ending in canonical records and their
visible status. Reuse domain command/router integration tests underneath it.
Do not add a parallel test API, mock-only business engine or test-only save path.
The owner confirmed this testing approach in the current chat.

Reuse prior work where source/platform/target evidence remains valid. Prior art
includes Jawdah's four-crate request/payment case, poultry stock reconciliation,
laundry durable Created/Open job receipts and independent completion/payment
tests, WhatsApp confirmation/replay tests, product-share public guards, barcode
string validation and supplier purchase recognition tests. Exact references and
limits are in the capability audit. A new local scorecard entry requires evidence
review; historical green counts are not copied automatically.

### Stable launch cases

Each row requires every stated outcome and applicable channel. A valid refusal
passes a refusal case; an unsupported required positive workflow stays blocked.
An app handoff does not satisfy an expressly WhatsApp-native requirement.

| ID | Jawdah case: required outcome |
| --- | --- |
| J01 | Normal owner setup, correct saved currency/Store/plan, authorized login and staff identity |
| J02 | Layers/broilers catalog, exact bird quantity/price and saved opening stock |
| J03 | Eggs with explicit 30-egg crate and one correct shared-stock balance |
| J04 | Repeated egg receipts reuse categories and show correct stock/history |
| J05 | Mortality decrease requires reason; balance/history correct and replay safe |
| J06 | Cashier can perform allowed sales; Catalog/Inventory/Staff/Finance administration refuses |
| J07 | Money-first assistant sale: Walk-in/customer, full/partial amount, evidence and canonical retry |
| J08 | Approved images, gallery/primary selection, unavailable/book-ahead policy and no private media exposure |
| J09 | Four-crate public bag, exact subtotal, customer login and retained request through navigation/retry |
| J10 | Merchant notification, delivery/pickup review and canonical confirmed Order with correct final total |
| J11 | Scoped payment link, manual evidence/review or configured verified payment, correct balance and no duplicate payment |
| J12 | Fulfilment/stock/money/history reconcile; required mobile/WhatsApp paths, stale reviews and tenant isolation verified |

| ID | Laundry case: required outcome |
| --- | --- |
| L01 | Store/service setup, garment/treatment/size choices and actual fixed/quote pricing |
| L02 | Customer intake: exact garments/quantities, evidence, due time and no invented customer/price |
| L03 | Assistant preparation resolves saved choices; one confirmation saves intake/Order/job and durable Created/Open job receipt |
| L04 | Required WhatsApp customer intake and save completes natively; unsupported/app-only path remains blocked |
| L05 | Eligible public customer service request/quote and preferred time reach correct merchant scope |
| L06 | Staff assignment/start/progress/due edits and reasons persist under current permissions |
| L07 | Notes/problems/photos and customer tracking show correct safe activity |
| L08 | Ready work completes while unpaid/part-paid and preserves the exact balance/history |
| L09 | Customer notification, scoped payment link and independent deposit/partial/full settlement |
| L10 | Separate customer collection/handoff or delivery respects work readiness and current policy |
| L11 | Cancellation/correction/retry/stale review is safe; original work/payment evidence survives |
| L12 | Dashboard/mobile/required WhatsApp records reconcile; unauthorized roles, foreign tenants/Stores and expired links refuse |

R01–R24 apply separately to Hypnos (H01–H24) and Alhaq (A01–A24).

| ID | Shared retail case: required outcome |
| --- | --- |
| R01 | Business/Store setup, correct NGN context, plan and owner/sales staff permissions |
| R02 | Review catalog suggestions and save 50 distinct base Products spanning the agreed categories; exact count survives reopen |
| R03 | Supplied options/brands/compatibility, sparse variants, prices, stock and units survive save/reopen without invented combinations |
| R04 | Multi-item photos/text map to the right products; reviewed private/public media boundaries persist |
| R05 | WhatsApp setup reaches 50 through resumable bounded batches; missing facts clarified, no truncation or duplicates |
| R06 | WhatsApp review/edit/confirm saves products with their photos/variants and produces one durable receipt per committed record |
| R07 | Final result opens exact saved Product in authenticated web/app, with web fallback and access to its code details |
| R08 | Optional manufacturer code maps to exact offering/unit; leading zeros/tenant uniqueness and uncoded products work |
| R09 | Sale-entry scan resolves exact Product/option; unknown/ambiguous codes, camera denial and QR URLs recover safely |
| R10 | Named shipment retains supplier/reference, expected items and status; draft does not increase available stock |
| R11 | Exact expected quantities, purchase currencies/unit prices and new/existing item mapping survive reviewed save |
| R12 | Explicit source-to-NGN rates, original money, converted totals and historical rate provenance; missing/invalid rate refuses |
| R13 | Shared freight allocations reconcile exactly, including rounding/zero-value/manual override cases |
| R14 | Partial/full receipt inbounds only actual quantities; remaining expected quantity and duplicate/concurrent replay are correct |
| R15 | Reviewed landed-cost adjustment and separate prospective selling-price change preserve prior stock-cost/Order history |
| R16 | Full required shipment prepare/review/receive/cost workflow completes through WhatsApp with the same canonical effects |
| R17 | Published-business-site product sharing selects the verified Store host; public choices and other products browse correctly |
| R18 | Without a published Site, platform product link and browseable business catalog work with explicit public eligibility |
| R19 | Central order/payment link works in both site modes and exposes only the scoped customer/order projection |
| R20 | Website and customer-bot requests retain exact options/quantities/current prices and stock checks; repeated submission is safe |
| R21 | New request/order notification reaches authorized merchant staff once, opens the exact record and survives refresh |
| R22 | Merchant reviews final charge/delivery, composes customer follow-up, shares payment link and verifies payment without AI proof shortcuts |
| R23 | WhatsApp counter sale records exact choices, customer, unpaid/partial/full state, stock effect and one receipt under retry |
| R24 | Dashboard/mobile/WhatsApp stock, shipment, sale, payment and price histories reconcile; role/scope/stale-link safeguards hold |

### Metrics and evidence rules

- Stable denominator: Jawdah 12 + Laundry 12 + Hypnos 24 + Alhaq 24 = **72 cases**.
  Shared requirement definitions are reused, but each retail business must pass
  on its own representative catalog/units/options. Do not count this as test-line
  coverage or the existing Finance/WhatsApp/Factory roadmap percentage.
- Primary metric: passed required cases /72 × 100. Per-business metrics are
  passed/12, passed/12, passed/24, passed/24. Also show failed, blocked and
  not-assessed counts. A blocked or untested case remains in the denominator.
- Launch target: **72/72 (100%)**, every business 100%, no unresolved critical
  money, permission, stock, concurrency or native-compatibility defect, plus all
  independent legal/provider/release gates satisfied. This means all agreed
  cases passed, not a guarantee of zero possible defects.
- A case passes only when all applicable journey surfaces have adequate evidence.
  Record private/public channel and dashboard/mobile/WhatsApp separately; public
  browsers do not need access to merchant-only Finance. Reuse shared component
  checks; do not multiply ordinary checks across every theme/font/device.
- Record exact source candidate, relevant runtime identity, target/environment,
  case version, role/Store scope in private evidence, date, result, receipt link,
  reviewer and remaining limitation. Preserve prior attempts when results change.
  Keep PII, credentials and opaque capability tokens out of tracked artifacts.
- Use statuses NOT_ASSESSED, BLOCKED, FAIL, PASS. Initial register is **0/72 newly
  credited** and all 72 NOT_ASSESSED: this is an evidence baseline, not a claim that
  existing functionality is 0% implemented or that previous proof is invalid.
- Map and review historical evidence first. Local/simulated proof cannot satisfy
  a required real provider/native/hosted launch gate. Wrong/stale runtime evidence
  cannot pass. The intended launch candidate/environment still needs selection.
- If the owner changes scope, version the register, preserve old results and
  disclose the changed denominator. Do not silently exclude a hard case.
- Follow the existing offline doctor, focused smoke and existing-data QA entry
  points. This task runs document/source checks only. Future write-based business
  acceptance needs an explicitly authorized nonproduction data window; the normal
  read-only UI smoke must not create fixtures or submit a sale/payment to pass.

## Out of Scope

- Implementing missing features, setting up real stores or seeding 50 Products now.
- Deploying/pushing, changing schema/database, provider settings or billing plans,
  publishing a storefront/design/Site, or sending customer/WhatsApp messages.
- A domain rename from EwaTrade to the spoken `ourtrade.com`.
- An automatic live FX feed, currency trading or unrestricted unsupported currency
  precision. Support exact validated currencies including relevant CNY/USD/NGN;
  unsupported codes/precision need explicit refusal rather than guessed conversion.
- Manufacturing arbitrary labels, barcode printing, authenticity guarantees,
  inventory serialization/warranties or unrelated payroll/accounting modules.
  Existing code display/association and scan-to-sale are in scope.
- Inventing real merchant prices/stock/photos, marking proof complete from source
  presence, replacing existing release acceptance, or creating GitHub issues.

## Further Notes

Before each implementation slice, resolve only its blocking product decisions:
platform domain/route and no-site public-listing consent/entitlement; shipment
freight/adjustment treatment and approved rate source; exact WhatsApp/native scope;
merchant-approved catalog data and launch target. The proposed seams are agreed;
these remaining choices do not prevent the local journey/spec deliverable.

Suggested delivery order: shipment/cost contract → canonical shipment commands
and money/replay checks → scan lookup and saved-product navigation → rich/resumable
WhatsApp product/shipment flows → no-site public catalog and host-aware links →
targeted four-business operating acceptance. Review existing implemented designs
before UI changes and retain all current human/provider/release boundaries.

Planning checklist: [x] prior journeys located; [x] source audit; [x] four journeys
and scorecard authored; [x] document validation. Planning 4/4 complete; the local
commit is identified in Git history and the task handback. These are four planning
tasks, not the 72 launch cases. Current implementation gap status belongs to the
audit; future operating results belong to the register.

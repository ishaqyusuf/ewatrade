# EwaTrade Nigeria Competitive Landscape

## Research question

How does EwaTrade compare with currently operating Nigerian merchant software,
fintech, and B2B-commerce products, what concrete edge does each product have,
and where does EwaTrade have a defensible advantage today?

Research date: 2026-07-24.

## Executive conclusion

**Moniebook is the closest direct threat.** It now makes almost the same
top-line promise as EwaTrade—offline-first sales, stock, staff, reporting and
multi-branch operations—but adds Moniepoint's payment terminals, automatic
payment reconciliation, banking distribution and an established Nigerian
merchant-support network.

**Bumpa is the strongest merchant-growth and online-commerce competitor.** It
combines inventory and order management with websites, online payments,
shipping, invoicing, customer marketing, barcodes and multi-location
operations. EwaTrade should not claim an e-commerce advantage while its
Product storefront publishing remains unimplemented.

**EwaTrade's clearest implemented differentiation is operational depth, not
payments or audience reach.** Its strongest capabilities are:

- exact decimal inventory units and immutable unit-configuration versions;
- explicit separation of shared stock and packaged stock;
- stock receipts, counts, adjustments, transformations, custody, transfers,
  closeout, fulfillment and returns on one operation ledger;
- idempotent offline command replay with dependency ordering and visible
  conflict review;
- Product and Service Items in one neutral Catalog and mixed Orders;
- full Service Request, immutable Quote, Intake, Job/Job Line, assignment,
  promise, rework, customer tracking and payment-balance workflows.

No reviewed competitor publicly documents that complete combination. That does
not prove the competitors lack every capability; it means the capability is
not established by the reviewed public first-party material.

## Scope and method

The comparison uses only current official product, support, terms, developer,
and pricing pages retrieved on 2026-07-24. It separates:

1. **direct merchant-operations products**, which compete for the merchant's
   daily sales/stock workflow; and
2. **adjacent platforms**, which compete mainly through payments, banking,
   credit, procurement, distribution or logistics.

EwaTrade claims are limited to implemented Brain contracts, especially:

- [`generic-catalog-inventory-units-stock-operations.md`](../features/generic-catalog-inventory-units-stock-operations.md)
- [`generic-service-operations.md`](../features/generic-service-operations.md)
- [`retail-ops-reporting.md`](../features/retail-ops-reporting.md)
- [`retail-ops-onboarding.md`](../features/retail-ops-onboarding.md)
- [`progressive-feature-revealing.md`](../features/progressive-feature-revealing.md)
- [`api/endpoints.md`](../api/endpoints.md)

Product storefront publishing, direct online payment collection, appointments,
calendar/resource scheduling, receipt printing, and managed public media
evidence are not credited to EwaTrade because they are unimplemented, deferred,
or explicit non-goals in the current Brain.

## Capability matrix

Legend: **Yes** = explicitly documented by a current first-party source;
**Limited** = narrower or plan/vertical-specific capability; **Not established**
= not confirmed in the reviewed public first-party material, not proof of
absence.

| Product | Main category | Sales / POS | Inventory | Offline operations | Staff / multi-site | Customer online ordering | Embedded payments / banking / credit | Procurement / logistics | Tracked service work, requests and quotes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **EwaTrade** | Merchant operations | Yes | **Advanced exact-unit ledger** | **Yes, replay + conflict review** | Yes | Limited to public Service Requests, Quotes and tracking | Limited to operational payment records | No | **Yes** |
| **Moniebook** | Merchant operations | Yes | Yes, including reordering | Yes, officially “offline-first” | Yes, role and branch management | Not established | **Yes, Moniepoint terminals and reconciliation** | Not established | Not established |
| **Bumpa** | Commerce operations | Yes, tiered | Yes | Not established | Yes, tiered | **Yes, merchant website** | Yes, local/international collections and Terminal | Shipping integrations | Not established |
| **Traction** | Payments + operations | Yes | Yes | Not established | Yes | Yes, e-commerce/catalog | **Yes, terminals, transfer, USSD and loans** | Not established | Not established |
| **Orda Africa** | Restaurant operations | Yes | Yes, including recipe management | Limited: POS says little-to-no internet | Restaurant/store-specific | **Yes, omnichannel and microsite** | Yes, payments and credit/lending | Limited to food inventory/procurement workflow | Limited to restaurant order workflow, not generic Service Jobs/Quotes |
| **Nomba** | Payments + business banking | Yes | Limited, hospitality positioning mentions it | Not established | Limited | **Yes, checkout/payment links/plugins** | **Yes, POS, accounts, FX, overdrafts and APIs** | No | Not established |
| **Prospa** | Business banking + spend | No retail POS established | Not established in current product navigation | Not established | Yes, team access | No storefront established | **Yes, business account, cards, loans and spend management** | No | Not established |
| **Alerzo / Veedez** | B2B restocking + business tools | Limited | Yes via Veedez | Not established | Not established | B2B buying, not a merchant-owned consumer storefront | Yes via Veedez | **Yes, goods marketplace and delivery** | Not established |
| **OmniRetail** | FMCG distribution infrastructure | Yes across trade network | Yes | Not established | Yes, distributor/retailer network | B2B ordering, not consumer storefront | **Yes, OmniPay, POS, credit and cashback** | **Yes, network, inventory and logistics** | Not established |
| **Sabi** | B2B trade infrastructure | Not established as merchant POS | Not established on current public platform page | Not established | Ecosystem participants, not SME staff ops | B2B marketplace | **Yes, partner-led inventory/commodity finance and wallets** | **Yes, marketplace and logistics** | Not established |

## Direct merchant-operations competitors

### 1. Moniebook by Moniepoint

**Target customer.** Nigerian retail and restaurant SMEs, including
supermarkets, fashion stores, pharmacies, electronics shops and multi-location
businesses.

**Publicly documented product.** Moniebook describes itself as offline-first
and mobile-ready, connecting POS, inventory, bookkeeping, payments and CRM. It
documents sales recording, real-time stock, automatic reordering, analytics,
role-based staff management, multi-branch control, cloud backup and direct
integration with Moniepoint terminals for automatic end-of-day payment
reconciliation. [Moniebook official product page](https://moniepoint.com/moniebook)

**Pricing.** A trial/demo is offered, but a public software subscription amount
is not displayed. The related Moniepoint POS requires at least ₦21,500 upfront:
₦10,000 caution fee, ₦10,000 logistics and ₦1,500 one-year insurance.
[Moniepoint POS page](https://moniepoint.com/ng/business/point-of-sale-terminal)

**Its edge over EwaTrade today.**

- Embedded, regulated payment acceptance and automatic reconciliation through
  Moniepoint terminals.
- Bookkeeping and CRM are part of the public promise.
- Automatic reordering is already marketed.
- A mature field-distribution/support system, business accounts, expense cards
  and working-capital loans surround the operations product.
- Its offline-first and multi-branch positioning neutralizes two generic
  EwaTrade talking points.

**EwaTrade's edge.**

- A more explicit and auditable inventory model for exact units, packaged
  stock, transformations, configuration versions, custody, counts,
  corrections, closeout and returns.
- Offline behavior is not just branded “offline-first”; Brain specifies
  idempotency, dependencies, payload hashes, typed conflicts, device
  registration/revocation and manager conflict acknowledgement.
- Mixed Product and Service Orders plus generic Service Requests, Quotes, work
  allocation, rework and customer tracking are implemented.

**Competitive judgement.** Treat Moniebook as the benchmark to beat in every
retail sales conversation. EwaTrade wins only when the buyer values inventory
correctness, complex selling units, mixed product/service work or inspectable
offline reconciliation more than embedded payment rails.

### 2. Bumpa

**Target customer.** Retail, social-commerce and online-first SMEs that want
one app for inventory, orders, customers and a branded selling website.

**Publicly documented product.** Bumpa offers inventory and order management,
sales/expense recording, invoices and receipts, analytics, customer records
and marketing, business websites, online/local/international payments,
shipping integrations, staff accounts, multiple locations, product variants,
barcodes and POS. [Bumpa official site](https://www.getbumpa.com/)

Its 2026 update feed also documents multi-currency storefront additions,
location-specific business accounts, cross-catalog inventory history with
exports, order export improvements and a rebuilt product-variation flow.
[Bumpa product updates](https://updates.getbumpa.com/)

**Pricing.** The current site shows Starter at ₦15,000 quarterly and Pro at
₦30,000 quarterly, with a 14-day free trial and no monthly billing. Its support
page lists Starter at ₦55,000 yearly, Pro at ₦105,000 yearly, and Growth at
₦150,000 biannually or ₦250,000 yearly. [Bumpa plans](https://support.getbumpa.com/support/solutions/articles/150000193102-bumpa-subscription-plans)

The current landing page now also names Scale and Premium tiers whose public
amounts are not shown, so the complete price book should be reconfirmed before
publishing a live comparison.

**Its edge over EwaTrade today.**

- A live merchant website, online checkout, international collections and
  shipping integrations.
- Invoices/receipts, expense recording, customer engagement and online
  marketing integrations.
- Barcode generation/scanning and customer-facing POS flows.
- Public customer base, merchant education/community and visibly active
  product release cadence.
- Unlimited product listings on the documented paid plans, which is more
  attractive than EwaTrade's proposed launch caps.

**EwaTrade's edge.**

- Exact inventory-unit relationships and explicit transformations between
  canonical/shared and separately packaged stock.
- Richer stock-operation audit semantics, custody, closeout and offline
  conflict review.
- First-class Service Catalog and tracked Service work rather than a
  product-only commerce model.
- Public Request, immutable Quote acceptance, scoped tracking and rework for
  service businesses.

**Competitive judgement.** Bumpa is stronger for “help me sell online and look
professional.” EwaTrade should lead with “help me know exactly what stock,
staff and work changed—even through repacking and poor connectivity.”

### 3. Traction

**Target customer.** Nigerian SMEs that want payment acceptance plus basic
retail-management tools on mobile or a dedicated smart terminal.

**Publicly documented product.** Traction offers card, transfer and USSD
payments; mobile/full retail POS; sales and payment reconciliation; inventory;
invoices; CRM/customer management; employee management; e-commerce; digital
catalog; and business loans. [Traction official site](https://tractionapps.co/)

**Pricing.** The current public page lists Traction One at ₦110,000, Traction
Pro at ₦50,000 and Traction Solo at ₦15,000, each with lease-to-own options.
The current page does not publish a separate recurring software subscription
price.

**Its edge over EwaTrade today.**

- Integrated physical terminals and multiple Nigerian payment methods.
- Automatic sales/payment reconciliation, invoicing, e-commerce and loans in
  one acquisition funnel.
- Hardware purchase and lease-to-own choices lower the merchant's adoption
  decision to a familiar POS proposition.

**EwaTrade's edge.**

- More rigorous unit and stock-operation semantics, especially for merchants
  that split, transform or separately custody stock.
- Explicit offline replay/conflict controls rather than only a generic mobile
  management claim.
- Generic Service work and quote/tracking workflows.
- Immutable commercial snapshots protect historical unit, factor and price
  context after configuration changes.

**Competitive judgement.** Traction can win the first meeting by solving
payment acceptance immediately. EwaTrade needs a payment-terminal partnership
or integration path, while keeping its core value proposition centered on
operations rather than attempting to become a bank.

### 4. Orda Africa

**Target customer.** Restaurants, chefs and food-service businesses.

**Publicly documented product.** Orda offers restaurant POS, omnichannel order
aggregation including WhatsApp, a merchant microsite, branded mobile apps,
inventory and recipe management, analytics, and credit/lending. Its POS is
marketed as working with little to no internet. The official site also states
that Orda was acquired by Moniepoint.
[Orda Africa official site](https://orda.africa/)
[Orda terms](https://orda.africa/terms-of-service/)
[Orda acquisition announcement](https://orda.africa/orda-has-been-acquired-by-moniepoint/)

**Pricing.** Demo-led; no current public price is shown on the reviewed
`orda.africa` pages.

**Its edge over EwaTrade today.**

- Deep restaurant-specific order, recipe, channel and menu workflows.
- Existing consumer ordering through a microsite and omnichannel intake.
- Branded merchant apps, payment infrastructure and credit access.
- A narrower vertical product can be easier to understand and deploy than
  EwaTrade's generic operations model.

**EwaTrade's edge.**

- Broader support for retail, bulk/packaged goods, mixed product-service
  businesses and non-restaurant tracked services.
- Exact versioned units, packaged-stock transformations, custody and
  reconciliation.
- Generic Requests, versioned Quotes, partial work, line assignments, promises,
  evidence, rework and scoped customer tracking exceed a food-order workflow.
- Offline replay and manager-visible conflict handling are more explicitly
  specified.

**Competitive judgement.** Do not target sophisticated restaurants first
unless EwaTrade adds recipe/ingredient depletion, menu modifiers, kitchen
display and online ordering. Orda's vertical depth is the stronger pitch there.

## Adjacent fintech, banking and B2B-commerce platforms

### 5. Nomba

**Target customer.** Nigerian businesses that prioritize in-store/online
payment acceptance, business accounts, multi-currency collections, treasury,
overdrafts and payment APIs.

**Publicly documented product.** Nomba offers NGN/USD POS acceptance with
instant settlement, cards/transfers/USSD/QR, real-time notifications,
analytics, multi-currency wallets, checkout/payment links, Shopify and
WordPress plugins, APIs, payroll/vendor payments, treasury and overdrafts.
[Nomba business](https://nomba.com/business)
[Nomba POS](https://nomba.com/pos-terminals)
[Nomba Checkout](https://nomba.com/checkout/)

**Pricing.** Nomba publishes a ₦30,000 Mini and ₦150,000 Max. Its POS product
page and store show conflicting current amounts for Lite and Pro, so those
should be reconfirmed. Checkout publishes 1.0–1.4% for local cards capped at
₦1,800 and 3.8% for international cards.

**Its edge over EwaTrade today.**

- Regulated, proven payment acceptance in-store and online, instant settlement
  and fraud controls.
- NGN/USD acceptance, broader multi-currency wallets and FX.
- Physical terminal range and developer APIs for embedded payments.
- Overdraft, treasury and vendor/payroll payment products.
- Publicly claims more than 600,000 businesses and nationwide coverage.

**EwaTrade's edge.**

- Nomba's public materials lead with financial infrastructure, not exact stock,
  closeout, unit conversion, mixed Orders or Service Jobs.
- EwaTrade owns richer merchant operational truth and can remain
  payment-provider-neutral.

**Competitive judgement.** Nomba is more natural as a future payment partner
than a product to copy. The developer API supports pushing an order amount to a
terminal and receiving a webhook, which maps well to EwaTrade's separate
Commerce and payment-record boundary.
[Nomba terminal API](https://developer.nomba.com/docs/products/terminals/push-payment-request)

### 6. Prospa

**Target customer.** Registered businesses seeking a company-name account,
cards, loans and centralized spend management.

**Publicly documented product.** Prospa's current product navigation focuses on
a business account, business loans/invoice financing, expense cards and spend
management. The business account supports payments, scheduled bills,
beneficiary management, invoices/expenses in one dashboard and team access.
[Prospa business account](https://getprospa.com/business-account/)

**Pricing.** The current reviewed product pages do not show a complete public
price book. Official support says account opening is free and publishes
VAT-inclusive outbound transfer charges of ₦10.75 up to ₦5,000, ₦26.80 from
₦5,000.01 to ₦50,000, and ₦53.75 above ₦50,000. Account qualification and
business review may apply.
[Prospa account charges](https://intercom.help/prospa/en/articles/11036504-what-charges-will-i-incur-when-opening-a-business-account-with-prospa)
[Prospa transfer charges](https://intercom.help/prospa/en/articles/11121916-what-are-your-transfer-charges)

**Its edge over EwaTrade today.**

- Company-name banking, automated bill payment, expense cards and loans.
- Centralized control of vendor, employee and operating spend.
- A financial relationship that can become the business's system of record for
  cash flow.

**EwaTrade's edge.**

- Daily sales, exact inventory, staff operations, closeout, offline replay and
  Service work are the product core.
- EwaTrade's operational records explain what happened physically; Prospa's
  current public product explains how money moved.

**Competitive judgement.** Prospa is adjacent, not the best feature-by-feature
benchmark. It demonstrates that EwaTrade will eventually need clean
bank-feed/payment integrations so merchants do not re-enter financial events.

### 7. Alerzo / Alerzoshop / Veedez

**Target customer.** Informal and micro retailers/wholesalers that need to
restock FMCG goods, receive delivery and access lightweight payment/business
tools.

**Publicly documented product.** Alerzoshop connects Nigerian retailers to
goods from more than 200 manufacturers, advertises competitive unit rates,
same-day/free delivery and payment on delivery. Veedez is described as a
payments and business solution covering payment acceptance, invoices and
inventory. [Alerzo official site](https://alerzo.com/)
[Alerzoshop](https://alerzoshop.com/)

**Pricing.** No software subscription or marketplace fee is publicly shown on
the reviewed pages.

**Its edge over EwaTrade today.**

- Immediate access to suppliers, known FMCG inventory and last-mile delivery.
- Procurement convenience and price/promotional leverage from the supply
  network.
- Payment-on-delivery and payments/business tools reduce the number of apps a
  small shop needs.

**EwaTrade's edge.**

- Merchant-owned, supplier-neutral Catalog and operations work across
  industries rather than primarily FMCG restocking.
- Stronger internal stock semantics, staff/custody/closeout workflows, offline
  conflict review and mixed Service operations.
- EwaTrade can record stock from any supplier rather than make participation
  dependent on one procurement network.

**Competitive judgement.** Alerzo solves “where and how do I restock?” better.
EwaTrade solves “what exactly happened to the stock and work after it arrived?”
better.

### 8. OmniRetail

**Target customer.** FMCG manufacturers, distributors, traditional retailers
and trade businesses operating across a distribution network.

**Publicly documented product.** OmniRetail advertises a network spanning more
than 150 brands, 160,000 retailers and 900 SKUs. It provides manufacturer
visibility into distributor/retailer sales and stock, distributor inventory
and logistics tools, retailer doorstep restocking, promotions, collateral-free
credit, and OmniPay with a zero-transaction-fee POS, cashback and real-time
settlement. [OmniRetail official site](https://www.omniretail.africa/)

**Pricing.** No subscription price is public. “Zero transaction fee POS” is an
official marketing claim, but hardware, eligibility and other commercial terms
are not displayed on the reviewed page.

**Its edge over EwaTrade today.**

- A real manufacturer-distributor-retailer network and product supply.
- Embedded logistics, credit, promotions, payments and cashback.
- Cross-value-chain visibility that a standalone merchant operations product
  cannot create by software features alone.
- Scale and channel relationships form a network moat.

**EwaTrade's edge.**

- Merchant-level exact inventory configuration, transformations, operational
  closeout and offline conflict review.
- Industry-neutral Product/Service commerce and tracked service operations.
- Merchant workflows are not constrained to FMCG network participation.

**Competitive judgement.** Do not reproduce OmniRetail's asset/network-heavy
model. Use it as evidence that procurement and financing partnerships can sit
beside EwaTrade's deeper merchant operations layer.

### 9. Sabi

**Target customer.** Wholesale and last-mile merchants, distributors,
logistics partners, financiers and cross-border commodity participants.

**Publicly documented product.** Sabi Market combines B2B supply discovery,
logistics and embedded finance for FMCG distribution. Sabi also offers
partner-led inventory finance, export credit, savings, wallets and FX. TRACE
supports cross-border commodity contracting, aggregation, quality assurance,
logistics, compliance and ESG processes. [Sabi platform](https://sabi.am/platform)
[Sabi official site](https://sabi.am/)

Its terms confirm an operating Nigerian website/mobile e-commerce platform
with supporting logistics and payment infrastructure for buyers and
suppliers. [Sabi terms](https://sabi.am/policies/terms-and-conditions)

**Pricing.** Not publicly displayed.

**Current-operation caution.** The official platform and Nigerian terms remain
live, but the public site's newsroom/footer recency is weaker than the other
eight products. Treat Sabi as a strategically relevant adjacent platform, not
as independently verified high-activity 2026 market traction.

**Its edge over EwaTrade today.**

- B2B supply discovery, logistics and finance around physical-goods trade.
- Buyer/supplier verification and network trust.
- Cross-border commodity operations and compliance depth through TRACE.
- Financing options tied to inventory and trade flows.

**EwaTrade's edge.**

- Daily SME sales/POS, exact store stock, staff, closeout and offline workflows
  are a clearer operating product for an individual merchant.
- Product and Service work coexist, including Requests, Quotes and customer
  tracking.
- EwaTrade is not limited to marketplace-sourced inventory or distribution
  transactions.

**Competitive judgement.** Sabi is trade infrastructure; EwaTrade is the
merchant operating layer. Partnership or data interoperability is more
strategic than direct feature competition.

## Strategic positioning

### Recommended category

Do not launch EwaTrade as another “all-in-one business app.” Moniebook, Bumpa,
Traction, Nomba, Alerzo and OmniRetail can all make that claim with stronger
payments, networks or awareness.

Position it as:

> **The offline operations system for businesses that sell in flexible units,
> transform or hand stock between people, and deliver both products and
> services.**

An even more operational version for sales material:

> **Know what came in, what was repacked or assigned, what each person sold,
> what work is still open, and what should remain—even when the internet
> fails.**

### Best initial customer segments

1. Bulk and packaged-goods merchants selling cartons, packs, bags, kilograms,
   litres, lengths or smaller prepared units.
2. Businesses that move stock between owner, store, attendant and branch and
   need closeout/variance accountability.
3. Mixed businesses such as electronics + repair, products + installation, or
   supplies + maintenance.
4. Tracked service businesses needing intake, quote approval, assignments,
   promised dates, partial readiness, rework and customer tracking.
5. Operators in unreliable-connectivity environments where replay safety and
   conflict visibility matter more than a basic cached POS screen.

### Segments to avoid initially

- Online-first merchants whose primary need is a storefront, ads, shipping and
  international checkout: Bumpa is currently stronger.
- Sophisticated restaurants requiring recipes, kitchen displays, table/menu
  workflows and omnichannel delivery: Orda/Moniebook are stronger.
- Merchants whose only unmet need is a reliable payment terminal or business
  account: Moniepoint, Nomba and Traction are stronger.
- Retailers whose main pain is supplier access, credit and delivery:
  Alerzo/OmniRetail/Sabi are stronger.

## Gaps EwaTrade should close

### Launch-critical

1. **Payment integration.** Support at least one Nigerian terminal/checkout
   provider without making EwaTrade the custodian. Nomba's push-to-terminal API
   is one plausible integration pattern; Moniepoint and Traction are also
   commercially relevant.
2. **Production readiness proof.** Convert local behavioral validation into
   production tenant references, reliability evidence and merchant case
   studies. Competitors can sell trust and distribution, not just features.
3. **Simple invoicing/receipts and exports.** Bumpa, Traction, Moniebook and
   Prospa make these expected table stakes. EwaTrade currently records
   Commercial Orders/payments and offers reporting exports, but should not
   imply customer-ready invoice/receipt parity.
4. **Public commercial clarity.** Publish pricing, limits, support response
   expectations and the offline behavior contract in merchant language.

### Next, based on target segment

5. **Barcode/receipt hardware support** for conventional retail.
6. **Provider-connected payment reconciliation** so closeout compares physical
   declarations with verified settlements.
7. **A narrow customer selling surface** only after the current Product
   storefront/publishing boundary is implemented safely.
8. **Supplier and reorder integrations** rather than building a proprietary
   warehouse/logistics network.
9. **Bookkeeping handoff/export integrations** rather than attempting to
   replace full accounting immediately.

## Pricing implications

- EwaTrade's lower proposed Nigerian price can help entry, but price alone is
  not a moat against free business accounts, subsidized POS acquisition or
  platforms monetized through payments/credit.
- The proposed ₦3,000/₦8,000/₦20,000 monthly equivalents remain competitive
  with Bumpa's public subscription levels, but EwaTrade should charge for
  operational complexity and accountability, not advertise itself as merely a
  cheaper Bumpa.
- Moniebook's undisclosed software price means it must be mystery-shopped
  before final public price comparisons or sales battlecards are approved.
- A payment partner may add transaction and hardware economics outside the
  EwaTrade subscription. Keep those charges visibly separate.

See the separate [launch pricing recommendation](./2026-07-24-launch-pricing-model.md).

## Important evidence limitations

- Public product pages are marketing contracts, not exhaustive technical
  specifications. “Not established” must never be restated as “does not have.”
- Offline claims vary in meaning. Only EwaTrade's internal Brain material
  describes idempotent dependency-aware replay and conflict review in the
  evidence reviewed; competitor offline implementations were not technically
  audited.
- Nomba's current POS product page and store disagree on some hardware prices.
- Bumpa's current landing page has expanded tier names beyond the cited support
  price table. Recheck both immediately before publishing a comparison.
- Public scale figures are company claims and were not independently audited.
- EwaTrade's advantages describe implemented repository/product contracts, not
  proven market adoption. Competitors have the stronger public evidence of
  active merchants, payments, support and distribution.

## Source list

### EwaTrade internal sources

- [Generic Catalog, Inventory Units and Stock Operations](../features/generic-catalog-inventory-units-stock-operations.md)
- [Generic Service Operations](../features/generic-service-operations.md)
- [Retail Ops Reporting](../features/retail-ops-reporting.md)
- [Business Onboarding](../features/retail-ops-onboarding.md)
- [Progressive Feature Revealing](../features/progressive-feature-revealing.md)
- [API endpoints](../api/endpoints.md)
- [Product Image Marketplace and Storefront Publishing—implementation not started](../features/product-image-marketplace-and-storefront-publishing.md)

### Competitor first-party sources

- [Moniebook](https://moniepoint.com/moniebook)
- [Moniepoint business products](https://moniepoint.com/ng/business)
- [Moniepoint POS](https://moniepoint.com/ng/business/point-of-sale-terminal)
- [Bumpa](https://www.getbumpa.com/)
- [Bumpa plans](https://support.getbumpa.com/support/solutions/articles/150000193102-bumpa-subscription-plans)
- [Bumpa updates](https://updates.getbumpa.com/)
- [Traction](https://tractionapps.co/)
- [Orda Africa](https://orda.africa/)
- [Orda terms](https://orda.africa/terms-of-service/)
- [Orda acquisition announcement](https://orda.africa/orda-has-been-acquired-by-moniepoint/)
- [Nomba business](https://nomba.com/business)
- [Nomba POS](https://nomba.com/pos-terminals)
- [Nomba store](https://nomba.com/store)
- [Nomba Checkout](https://nomba.com/checkout/)
- [Nomba terminal API](https://developer.nomba.com/docs/products/terminals/push-payment-request)
- [Prospa business account](https://getprospa.com/business-account/)
- [Prospa account charges](https://intercom.help/prospa/en/articles/11036504-what-charges-will-i-incur-when-opening-a-business-account-with-prospa)
- [Prospa transfer charges](https://intercom.help/prospa/en/articles/11121916-what-are-your-transfer-charges)
- [Alerzo](https://alerzo.com/)
- [Alerzoshop](https://alerzoshop.com/)
- [OmniRetail](https://www.omniretail.africa/)
- [Sabi platform](https://sabi.am/platform)
- [Sabi terms](https://sabi.am/policies/terms-and-conditions)

# Embedded domain purchasing: provider evaluation

Date: 2026-07-24
Status: Research and recommendation only; no implementation decision has been
committed.

## Executive recommendation

EwaTrade should use a **two-provider launch**, behind one provider-neutral
domain service:

1. **`.com.ng`: GO54 (formerly WhoGoHost) as the launch provider.**
   GO54 is listed by NiRA as an accredited registrar, offers a domain-reseller
   programme with no joining fee, publishes a domain API, prices and funds the
   service in naira, and has a support-assisted staging environment. Its API
   covers availability, registration, renewal, inbound transfer, contact and
   nameserver changes, registrar lock, EPP/auth-code retrieval, and status
   synchronization. This is the best fit for a Nigeria-first, in-app purchase
   experience, subject to the due-diligence gate below.

2. **Global domains: Openprovider as the launch provider.**
   Openprovider explicitly targets domain resellers and SaaS builders embedding
   domains into their own products. It offers a REST/JSON, OpenAPI-described API,
   a separate OT&E sandbox, lifecycle operations, DNS, DNSSEC, WHOIS privacy,
   auth-code access, and domain mutation webhooks. A reseller account and API
   access are free; an optional Membership unlocks cost-price domains. This is a
   materially better contractual and technical fit than buying domains through a
   general hosting account at Vercel or Cloudflare. **However, Openprovider
   currently reports that its sandbox is not functioning properly and expects a
   replacement on July 27, 2026.** Treat restoration of a working sandbox and a
   passed acceptance spike as a launch blocker, and progress OpenSRS due
   diligence in parallel.

Recommended fallbacks:

- **`.com.ng` fallback: ConnectReseller / OwnRegistrar.** OwnRegistrar is on
  NiRA's accredited-registrar list. ConnectReseller publishes `.com.ng` at
  **US$4.89** for registration, renewal, and transfer on its entry tier, with no
  setup fee, annual fee, or minimum commitment. Its reseller API and customer
  model are suitable for embedded resale. Its principal gap versus GO54 is USD
  funding/payment overhead and the absence of a clearly documented public
  sandbox and webhook system.
- **Global fallback: OpenSRS (Tucows).** OpenSRS is a mature white-label
  reseller platform with a full Horizon test environment, managed DNS,
  registrant/customer tooling, and a comprehensive lifecycle API. It is more
  cumbersome than Openprovider because the core API is XML, live access uses
  IP allowlisting, and activation requires a US$95 credit deposit, but it is a
  strong operational fallback.

Do **not** use Vercel Domains as EwaTrade's embedded registrar at launch.
Vercel now has a real Domains Registrar API (search, price, buy, renew, transfer,
and nameserver management), so the limitation is no longer technical
availability. The problem is commercial and ownership fit: Vercel documents
account/team-scoped domain use, and its API Terms expressly prohibit assisting a
third party to resell or distribute services through the API unless expressly
permitted. It publishes no reseller/white-label programme, and its domain terms
say a Team Owner may become the registrant when the registrant cannot otherwise
be identified. EwaTrade should use Vercel for deployment and domain attachment,
not as the merchant-facing registrar, unless Vercel gives written contractual
approval for third-party resale and confirms merchant-as-registrant semantics.

Cloudflare Registrar is also not the launch reseller. Its new registrar API is
useful and inexpensive, but is still beta, currently caps an account at 100
domains, supports only a subset of extensions programmatically, requires
Cloudflare authoritative nameservers, and does not advertise a reseller model.
Cloudflare remains a good DNS option where its account and nameserver model fit.

## Decision table

| Scope | Primary | Fallback | Why |
| --- | --- | --- | --- |
| `.com.ng` | **GO54** | **ConnectReseller / OwnRegistrar** | GO54 combines NiRA accreditation, NGN economics, public lifecycle API, and support-assisted staging. ConnectReseller is independently NiRA-accredited, API-first, price-transparent, and contractually reseller-oriented. |
| `.com`, `.org`, `.net`, and other global TLDs | **Openprovider** | **OpenSRS** | Openprovider has the best developer experience and explicitly supports SaaS embedding. OpenSRS provides mature white-label operations and a full test environment. |
| Authoritative DNS | Provider-neutral adapter; Cloudflare DNS is a strong option | Openprovider/registrar DNS for initial simplicity | Separating DNS from registration reduces migration cost, but only if the registrar permits custom nameservers. |
| Hosting / deployment | **Vercel** if it remains the application host | Other deployment provider | Registrar choice should not be coupled to storefront hosting. |

## Non-negotiable due-diligence gates

Do not send a live registration until the chosen provider confirms the following
in writing and passes a test registration:

- EwaTrade is authorized to resell domains through its own app and web
  dashboard.
- The merchant/end customer, not EwaTrade, is recorded as the registrant.
- EwaTrade may supply unique registrant contacts per merchant and can update
  them.
- The merchant can obtain the EPP/auth code and transfer out without an
  EwaTrade-specific lock-in fee.
- Current register, renew, restore/redemption, transfer, privacy, and DNS prices
  are supplied in a machine-readable or contractually stable form.
- API rate limits, idempotency behaviour, timeout/retry rules, and duplicate
  charge handling are documented.
- Test/staging behaviour, support escalation paths, incident notifications,
  and any uptime or response-time commitments are documented.
- DNSSEC availability for `.com.ng`, supported DS algorithms, and API/control
  path are confirmed.
- WHOIS/RDDS privacy handling and registrant-verification responsibilities are
  confirmed.
- Chargeback, fraud, abuse, suspension, and reseller termination processes
  preserve the legitimate merchant's ability to recover or transfer a domain.

## Regulatory and ownership model for `.ng`

NiRA is the `.ng` registry and operates a
[Registry–Registrar–Registrant model](https://www.nira.org.ng/). It does not
sell domains directly to end users. NiRA's
[registrar page](https://nira.org.ng/registrar/) says accredited registrars
facilitate registration, transfer, renewal, and modification for customers.
NiRA's registrar agreement explicitly defines a
[reseller as a person appointed by a registrar to sell domain services on its behalf](https://nira.org.ng/pdf/NIRA-REGISTRAR-AGREEMENT.pdf).
That makes the correct launch structure:

> NiRA registry → accredited registrar → EwaTrade as reseller/agent → merchant
> as registrant.

EwaTrade must not register merchant domains under an EwaTrade employee,
technical account, or generic platform identity. The merchant must be the
registrant, while EwaTrade can be the billing/technical contact where the
provider and registry rules permit it.

NiRA's agreement also requires registrars to bind registrants to applicable
registrant agreements, support transfers, and clearly expose standalone domain
prices even when domains are sold in a bundle. EwaTrade therefore needs an
explicit domain agreement acceptance step and must show:

- registration price;
- renewal price;
- transfer price;
- post-expiration/restore price;
- term and auto-renew status;
- non-refundability after successful registration; and
- the applicable NiRA/registrar terms.

NiRA says `.ng` domains may be registered for one to five years and are deleted
102 days after expiration if not renewed, although provider-specific grace and
restore handling still needs to be surfaced from the registrar
([NiRA lifecycle notice](https://nira.org.ng/nira-media-news-update-362-ng-domains-have-a-life/)).

NiRA announced WHOIS privacy redaction beginning June 16, 2025: personal names,
phone numbers, and email addresses are replaced with "Data Redacted" in public
WHOIS. Registrars still require accurate contact data, and EwaTrade must still
collect, protect, and pass that data under the applicable privacy agreements
([NiRA announcement](https://nira.org.ng/a-presidential-note-of-appreciation-and-reflection-on-niras-17th-agm/)).
NiRA also reported implementation of DNSSEC for the `.ng` namespace
([17th AGM report](https://nira.org.ng/nira-17th-agm-and-new-executive-board-of-directors/)).
Registry-level DNSSEC support does not prove that a particular reseller API
exposes DS management, so this remains a provider acceptance test.

No current official NiRA documentation located during this review establishes a
public `.ng` RDAP endpoint that EwaTrade can rely on. Treat provider lifecycle
responses and NiRA WHOIS as the supported sources until NiRA or the selected
registrar confirms RDAP in writing.

### Why not direct NiRA accreditation at launch

Direct accreditation is a later-stage option, not a launch dependency.
NiRA's current published policy requires an incorporated legal person, NiRA
membership, domain/DNS competence, secure electronic registration and payment
systems, registrant support, and the ability to handle renewal and transfer
operations. Provisional accreditation lasts up to six months and includes
interface, policy, and regulatory tests; full accreditation and annual
recertification fees also apply
([NiRA accreditation policy](https://nira.org.ng/pdf/NiRA-Registrars-Accreditation-Policy-1.pdf)).
The operational and compliance burden is unjustified before EwaTrade has
meaningful domain volume.

## `.com.ng` provider evaluation

### 1. GO54 / WhoGoHost — recommended launch provider

**Accreditation and reseller fit**

- NiRA lists
  [GO54 Limited, formerly WhoGoHost Limited, as an accredited registrar](https://nira.org.ng/business-directory/accredited_category/registrars/).
- GO54's
  [domain-reseller programme](https://whogohost.com/index.php/domains/domain-reseller)
  says joining is free, resellers set their own customer prices, API integration
  is provided, and support is available 24/7.
- GO54 documents an advance-deposit model: the reseller needs a positive credit
  balance to place orders
  ([reseller knowledge base](https://whogohost.com/host/knowledgebase/22/Domain-Resellers)).

**API and lifecycle**

The current [GO54 API reference](https://api-docs.go54.com/) documents:

- availability lookup, including `.com.ng`;
- registration with separate registrant, admin, technical, and billing contacts;
- renewal and inbound transfer;
- EPP/auth-code retrieval;
- contact retrieval and update;
- transfer and domain status synchronization;
- registrar-lock retrieval/update; and
- nameserver retrieval/update.

The [API introduction](https://api-docs.go54.com/api-reference/introduction)
also advertises DNS record management. Registration accepts optional DNS
management and identity-protection add-ons. Authentication uses an API key
issued by GO54, with a time-derived HMAC token. This is workable, but less
standard than OAuth or scoped bearer tokens and should be isolated behind an
EwaTrade credential adapter.

**Sandbox, events, and reliability**

- The [API structure page](https://api-docs.go54.com/api-reference/general/domain/api-structure)
  says staging details are available by contacting support; production uses a
  WhoGoHost-hosted base URL.
- No domain lifecycle webhook, published idempotency key, public rate-limit
  contract, or formal domain API SLA was located in the official public docs.
  EwaTrade should therefore use its own operation ledger, idempotency keys, and
  polling/reconciliation jobs even if private provider documentation later adds
  callbacks.
- GO54 advertises 24/7 support and states that email support responds within 24
  hours, but this is not the same as a contractual incident SLA.

**Pricing and payment**

On **July 24, 2026**, GO54's current public domain page (the older `/solutions/`
URL redirects to `/domains/domain-registration/`) listed `.com.ng` at
**₦3,000 registration / ₦7,200 renewal / ₦7,200 transfer**, with free DNS
management
([observed retail table](https://whogohost.com/domains/domain-registration/)).
An earlier page snapshot returned a different ₦6,450 registration figure, which
demonstrates that promotional retail prices can change or vary by surface.
Reseller pricing is discounted but is not public; it must be obtained after
reseller activation. Do not select a provider or calculate EwaTrade margin from
the retail page. Store dated provider quotes and fetch/reconfirm the actual
reseller price immediately before purchase.

**Privacy, WHOIS/RDAP, and DNSSEC**

- The registration API exposes an ID-protection option, while NiRA now redacts
  personal WHOIS fields at the registry level. Confirm whether the paid add-on
  changes anything for `.com.ng` before charging merchants for it.
- No provider-specific `.ng` RDAP commitment or DNSSEC/DS-management endpoint
  was found in GO54's current public domain API. Both require written
  confirmation.

**Launch verdict**

Best local launch fit, provided GO54 supplies current wholesale pricing,
staging credentials, written resale/registrant terms, DNSSEC details, and a
credible escalation path.

### 2. ConnectReseller / OwnRegistrar — recommended `.com.ng` fallback

**Accreditation and reseller fit**

- NiRA lists
  [OwnRegistrar Inc.](https://nira.org.ng/business-directory/accredited_category/registrars/)
  as an accredited registrar and links it to ConnectReseller.
- ConnectReseller identifies itself as OwnRegistrar's reseller arm and offers a
  white-label customer/reseller model
  ([company page](https://www.connectreseller.com/about-us/)).
- Entry tier requires no setup fee, annual fee, or minimum commitment
  ([tier system](https://www.connectreseller.com/tier-system/) and
  [domain plan details](https://www.connectreseller.com/domain-prices/tier-2/)).

**API and lifecycle**

ConnectReseller advertises an enterprise domain API with more than 300 commands
and provides downloadable API documentation
([integration options](https://www.connectreseller.com/integration-options/)).
Its official support material covers customer-level registrations, renewals,
transfers/auth codes, locks, contact changes, nameservers, A/CNAME/MX/TXT
records, privacy toggles, DNSSEC records, restoration, and bulk actions
([domains and DNS knowledge base](https://helpdesk.connectreseller.com/portal/en/kb/support/domains-and-dns)).

No clearly documented public sandbox or domain-event webhook facility was found.
That is the principal integration risk and must be tested before using it as an
automatic failover.

**Pricing and payment**

The current public entry-tier table lists `.com.ng` at **US$4.89** each for
registration, renewal, and transfer, and **US$99** restoration
([price list](https://www.connectreseller.com/domain-prices/)). Higher monthly
tiers reduce `.com.ng` to US$4.79 and US$4.59. Funding is wallet-based; global
card funding currently carries **4.4% + US$0.30**, with Payoneer and Zelle
available through sales
([payment options](https://www.connectreseller.com/payment-options/)).

**Reliability and privacy**

ConnectReseller advertises 24/7 technical support, free WHOIS protection, and
managed DNS with 99.9% uptime. Treat that 99.9% as a DNS service statement, not
an end-to-end registrar API SLA.

**Fallback verdict**

Strong independent technical and commercial fallback. The USD wallet and lack
of a clearly public sandbox/webhook contract make it less convenient than GO54
for the primary Nigerian path.

### 3. Upperlink — domestic procurement fallback, pending API review

- NiRA lists
  [Upperlink Limited as accredited](https://nira.org.ng/business-directory/upperlink-limited/);
  Upperlink also states it is ICANN-accredited.
- Its reseller page explicitly says resellers connect through an API to process
  registrations and renewals. It currently requires a **₦25,000** maintained
  wallet for its premium reseller plan and lists `.com.ng` at
  **₦7,000 reseller / ₦7,500 normal**
  ([Upperlink reseller page](https://domains.upperlink.ng/domain-name-resellers/)).
- Public instructions expose a WHMCS registrar module, API key, and IP
  allowlisting, but not a provider-neutral REST contract
  ([module guide](https://client.upperlink.ng/clients/knowledgebase/50/How-to-install-the-our-whmcs-registrar-module.html)).
- No public sandbox, webhook system, DNS record API, DNSSEC API, rate limit, or
  API SLA was found.

Upperlink is attractive if EwaTrade needs a separate Nigerian counterparty and
can obtain private API documentation, but it should not be selected before an
integration spike proves availability, registration, contact ownership,
nameserver/DNS management, renewal, and EPP transfer-out.

### 4. HOSTAFRICA / DomainKing — technically capable, not an independent GO54 fallback

- NiRA's current directory lists both DomainKing and HOSTAFRICA in the accredited
  registrar directory and links HOSTAFRICA to DomainKing's Nigerian domain
  offering.
- HOSTAFRICA publishes a substantial custom-integration API with availability,
  registration, renewal, transfer, EPP, contacts, locks, DNS records,
  nameservers/glue, deletion, status sync, pricing, credits, TLD catalogue, and
  domain information
  ([domain reseller API](https://my.hostafrica.com/resellerinfo.html)).
- API credentials are available after purchasing the reseller package, and IP
  allowlisting is optional
  ([integration guide](https://help.hostafrica.com/article/hostafrica-domain-reseller-for-whmcs)).
- Public pricing is visible inside the reseller area rather than in the API
  documentation. No public domain sandbox or webhook contract was located.

HOSTAFRICA acquired GO54 in 2025
([official acquisition announcement](https://www.hostafrica.com/wp-content/uploads/2025/01/HOSTAFRICA-GO54_Acquisition_-PR.pdf)).
Even if the brands continue to run distinct platforms, HOSTAFRICA/DomainKing is
not true corporate-counterparty diversification from GO54. It can be evaluated
as an alternative implementation, but not as the sole disaster-recovery
provider for the GO54 portfolio.

### 5. QServers — do not select without private API evidence

- NiRA lists
  [QServers Network Limited as accredited](https://nira.org.ng/accredited-registrars/).
- QServers sells domain reseller slabs at **₦15,000 / ₦50,000 / ₦100,000**
  ([reseller cart](https://process.qservers.net/cart.php?gid=20)).
- Its February 2025 announcement lists `.com.ng` at
  **₦6,500 registration / ₦7,000 renewal**
  ([price notice](https://process.qservers.net/index.php?rp=%2Fannouncements%2F105)).

No first-party public domain-registration API specification, sandbox, webhook
contract, DNSSEC interface, or API SLA was located. The reseller product alone
does not prove suitability for a custom EwaTrade integration.

### Local-provider summary

| Provider | NiRA status | Public custom API | Staging/sandbox | Public `.com.ng` economics | DNS / DNSSEC | Events | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **GO54** | Accredited | Strong lifecycle API | Staging by support | NGN retail public; reseller private | DNS advertised; DNSSEC unconfirmed | No public domain webhooks found | **Primary** |
| **ConnectReseller / OwnRegistrar** | Accredited | 300+ command reseller API | Not clearly public | $4.89 entry tier; no fixed account fee | DNS + DNSSEC documented | No public lifecycle webhooks found | **Fallback** |
| **Upperlink** | Accredited; also ICANN-accredited | API/WHMCS integration, sparse public contract | Not public | ₦7,000 reseller; ₦25,000 wallet floor | Not publicly documented for API | Not public | Domestic backup after spike |
| **HOSTAFRICA / DomainKing** | Listed by NiRA | Strong lifecycle/DNS/pricing API | Not public | Private reseller catalogue | DNS API; DNSSEC unconfirmed | Not public | Capable, but same parent as GO54 |
| **QServers** | Accredited | No public specification found | Not public | ₦6,500 / ₦7,000 published in 2025; reseller slabs from ₦15,000 | Not public | Not public | Do not select yet |

## Global provider evaluation

### 1. Openprovider — recommended global provider

**Why it fits EwaTrade**

Openprovider explicitly describes SaaS builders embedding domains into their
own products, and its terms recognize resellers that determine what services
they sell and at what price
([developer site](https://developers.openprovider.com/) and
[terms](https://www.openprovider.com/legal/terms-conditions)). This removes the
largest ambiguity present with general-purpose registrar accounts.

**API and lifecycle**

- REST/JSON with an OpenAPI specification and bearer-token authentication.
- Availability and price checks; registration; renewal; inbound transfer;
  contact/nameserver/lock updates; EPP/auth-code read/reset; bulk operations;
  portfolio search; and TLD-specific fields.
- Free and premium DNS zone/record APIs.
- Domain responses expose DNSSEC status, lock capability, WHOIS privacy
  eligibility/status, transfer requirements, and registry expiration state.
- Domain mutation webhooks can push lifecycle events to an authenticated
  EwaTrade endpoint
  ([webhook system](https://support.openprovider.eu/hc/en-us/articles/34308521422610-Webhook-Notification-System)).

The primary API and DNS details are in
[Openprovider's official API documentation](https://docs.openprovider.com/).
Webhook delivery is still an optimization rather than the source of truth:
EwaTrade must persist provider operation IDs and run polling/reconciliation
because webhooks can be delayed or exhaust their documented retry window.

**Sandbox**

Openprovider normally offers a production-isolated OT&E environment and free
sandbox account. Its current
[sandbox status article](https://support.openprovider.eu/hc/en-us/articles/8095671860114-Sandbox-Testing-Environment)
warns that the existing sandbox is not functioning properly because of
technical issues and says an improved sandbox is expected on **July 27, 2026**.
The same article says transfers cannot be tested in the sandbox and some TLDs
have test limitations. This is a live launch risk, not a documentation footnote:
do not approve Openprovider for production until the replacement is available
and the EwaTrade test suite passes. If restoration slips or material operations
remain untestable, use OpenSRS for the first global launch.

**Pricing, funding, and support**

- Free reseller signup and API access.
- Optional Membership unlocks cost-price access. Openprovider currently shows
  `.com` at approximately **US$10.46 member / US$11.98 non-member** for a new
  one-year registration; prices exclude VAT
  ([domain pricing](https://www.openprovider.com/domains/domain-prices)).
- The current
  [membership page](https://www.openprovider.com/membership-plans) lists Basic S
  at **US$4.16/month billed annually** (about US$49.92/year) for up to 100 domain
  operations, Basic M at US$16.66/month for up to 500, and Basic L at
  US$41.67/month for up to 2,000. Confirm what counts as an operation and
  overage/upgrade behaviour before modelling margins.
- Openprovider supports card, wire, PayPal, iDEAL, Bancontact, JCB, Diners Club,
  and Razorpay
  ([official 2026 comparison](https://www.openprovider.com/blog/openprovider-vs-centralnic)).
- It advertises 24/7 support and a dedicated account manager for Members. The
  public pages do not provide an end-to-end registrar API uptime SLA; request
  contractual incident targets during onboarding.

**Privacy, RDAP, and accreditation**

Openprovider states that it is ICANN-accredited and ISO 27001 certified. Its API
supports WHOIS privacy where allowed and records verification state. RDAP
availability ultimately varies by TLD/registry; EwaTrade should treat provider
lifecycle state as authoritative for workflows and link users to the applicable
RDAP/WHOIS service rather than promising one universal endpoint.

**Verdict**

Best overall global API and resale fit, conditional on the announced sandbox
replacement becoming available and passing the acceptance spike. OpenSRS is
the immediate launch substitute if that gate fails.

### 2. OpenSRS / Tucows — recommended global fallback

**Reseller and API model**

OpenSRS is explicitly white-label and permits resellers to let end users manage
products through a custom interface. Full Access provides API-driven automated
ordering and management
([access models](https://support.opensrs.com/support/solutions/articles/201000063497)).
Its XML API covers the registration lifecycle, contacts, transfers, DNS, and
domain settings. It is mature but has higher integration friction than
Openprovider's REST/OpenAPI surface.

**Sandbox and operations**

The Horizon test environment mirrors production closely, supplies test credits,
and does not create real registry registrations
([quickstart](https://support.opensrs.com/support/solutions/articles/201000063408)).
Production API access requires an API key and IP allowlisting; the test API does
not require live IP authorization
([XML API specification](https://www.opensrs.com/wp-content/uploads/opensrs_xmlapi.pdf)).
Managed DNS is included, and an end-user management interface is available.

The core Domains API exposes asynchronous state through `EVENT POLL` and
`EVENT ACK`, so EwaTrade can consume and acknowledge queued events
([OpenSRS event queue](https://support.opensrs.com/support/solutions/articles/201000063405)).
OpenSRS Storefront also provides signed push webhook notifications
([Storefront webhooks](https://support.opensrs.com/support/solutions/articles/201000127705-storefront-webhook-notifications)),
but EwaTrade should not assume Storefront webhooks cover every operation made
through a custom Domains API integration; the acceptance spike must prove the
exact event path used.

**Pricing and funding**

- One-time **US$95** activation deposit, converted to account credit; no annual
  fee
  ([payment terms](https://opensrs.com/payment-terms/)).
- Pre-funded live balance.
- More than 730 gTLDs/ccTLDs; `.com` currently starts from **US$11.50** at the
  highest tier
  ([pricing](https://opensrs.com/domains/pricing/)).
- Entry pricing has no performance minimum; higher tiers begin at 100 annual new
  registrations/transfers plus US$2,000 annual spend
  ([tier rules](https://support.opensrs.com/support/solutions/articles/201000063182-opensrs-reseller-pricing-structure)).
- Contact privacy is currently listed at US$3/year/domain on the public pricing
  page.

**Caveats**

- XML/MD5-era protocol and tight IP allowlisting increase operational effort.
- The test environment cannot test inbound domain transfers.
- No `.com.ng` support was confirmed in OpenSRS's current public TLD material;
  do not use it for the Nigerian path without written confirmation.

**Verdict**

Strong mature fallback for global domains, particularly if EwaTrade values
institutional reseller operations over API ergonomics.

### 3. Namecheap — viable low-volume API alternative, not preferred

Namecheap explicitly permits reselling through its API and lets the reseller set
its own price
([API introduction](https://www.namecheap.com/support/api/intro/) and
[reseller statement](https://www.namecheap.com/support/knowledgebase/article.aspx/754/63/do-you-have-a-domain-reseller-program/)).
It has a free, separate sandbox and APIs for search, registration, renewal,
contact changes, locks, DNS records, nameservers, and some transfers.

Production API access requires at least one of: 20 domains in the account,
US$50 balance, or US$50 spent in the prior two years. It also requires static
IPv4 allowlisting
([API FAQ](https://www.namecheap.com/support/knowledgebase/article.aspx/9739/63/api-faq/)).
The API is XML/query-parameter based, has published limits of 50 requests per
minute, 700 per hour, and 8,000 per day, publishes no general domain-lifecycle
webhook system, and inbound API transfers support only a limited list of TLDs
([API FAQ](https://www.namecheap.com/support/knowledgebase/article.aspx/9739/63/api-faq/)
and [methods](https://www.namecheap.com/support/api/methods/)).

Namecheap is a reasonable emergency alternative for common TLDs, but
Openprovider/OpenSRS offer a cleaner platform-reseller foundation.

### 4. GoDaddy — capable only through selected enterprise API-reseller access

GoDaddy's general Domains API is comprehensive, including JSON APIs for
availability, quote/registration, DNS, contacts, renewals, locks, transfers,
customer subaccounts, async operations, and notifications
([developer overview](https://developer.godaddy.com/en/docs/api-users)).
However, GoDaddy distinguishes ordinary Basic/Pro storefront resellers from API
Resellers:

- Basic/Pro resellers can sell through GoDaddy's storefront but cannot use the
  domain purchase/management APIs for embedded resale.
- API Reseller plans support customer-scoped domain actions and EwaTrade-owned
  billing, but are available only to selected businesses and require a
  certification test
  ([plan comparison](https://www.godaddy.com/en-uk/help/how-do-api-reseller-and-turnkey-reseller-plans-differ-7940)
  and [API reseller plan](https://www.godaddy.com/en-ca/help/what-is-an-api-reseller-plan-5939)).

GoDaddy is a future enterprise negotiation, not a self-service launch choice.

### 5. Enom — mature reseller option, secondary to OpenSRS

Enom offers a reseller control panel, API integration, bulk lifecycle
management, customer/sub-account pricing, and explicit resale
([reseller programme](https://www.enom.com/reseller/sell-domain-names/)).
Enrollment currently requires a **one-time US$50 reseller sign-up fee**
([Enom onboarding guide](https://support.enom.com/support/solutions/articles/201000065296-becoming-an-enom-reseller)).
Its current pricing has four performance tiers; the entry Essential tier has no
minimum, while Advanced requires 100 new registrations/transfers and US$2,000
annual domain/email/SSL spend
([pricing structure](https://support.enom.com/support/solutions/articles/201000065332-enom-reseller-pricing-structure)).

The public command catalogue is an older query/XML-style interface. Tucows owns
both Enom and OpenSRS, so using them together does not provide corporate
counterparty diversification. OpenSRS has the clearer current test and
white-label documentation and is the preferred Tucows option for EwaTrade.

### 6. Cloudflare Registrar — API exists, but it is not a reseller launch fit

As of April 2026 Cloudflare has a beta Registrar API that can search, return
real-time pricing, and register domains programmatically
([guide](https://developers.cloudflare.com/registrar/registrar-api/) and
[API reference](https://developers.cloudflare.com/api/resources/registrar/)).
The API is attractive because it returns registration and renewal prices and
Cloudflare sells standard domains at cost.

The launch blockers are explicit:

- a single account may own at most **100 domains** through the registration API;
- only a limited list of extensions is programmatically registrable;
- premium registrations are not supported;
- the current public registrar API does not expose a complete reseller
  lifecycle, including API renewal, transfer, and registrant-contact management;
- billing profile and agreement setup require dashboard actions;
- domains must keep Cloudflare authoritative nameservers; and
- Cloudflare does not advertise this API as a white-label reseller/subaccount
  programme.

Use Cloudflare Registrar for EwaTrade-owned domains or a merchant's own
Cloudflare account, not as the initial shared merchant portfolio. Cloudflare DNS
can still be used independently when nameserver delegation is supported.

### 7. Vercel Domains — technically capable, contractually unsuitable for resale

Vercel launched a new Domains Registrar API in October 2025. It can list TLDs,
price/check domains, buy single or bulk domains, retrieve order status, renew,
toggle auto-renew, transfer in/out, retrieve auth codes, update nameservers, and
retrieve TLD contact schemas
([registrar API](https://vercel.com/docs/domains/registrar-api) and
[launch note](https://vercel.com/changelog/new-domains-registrar-api-for-domain-search-pricing-purchase-and-management)).

That makes Vercel suitable for automating domains owned by a Vercel personal or
team account. It does **not** establish a reseller programme:

- API resources are owned by a personal account or Vercel team.
- Vercel's
  [API Terms](https://vercel.com/legal/api-terms) grant a limited,
  non-transferable, non-sublicensable licence for internal business purposes or
  a Vercel-permitted application, and expressly prohibit assisting a third
  party to resell or distribute the Services through the API except where
  expressly permitted.
- Vercel's domain terms say that if the registrant cannot be identified,
  Vercel may deem the authorized account holder to be the registrant; for a team,
  that can be the Team Owner
  ([Domain Name Terms](https://vercel.com/legal/domain-name-registration-and-services-terms)).
- Vercel publishes no white-label reseller, sub-reseller, per-merchant account,
  sandbox registrar, or wholesale pricing programme.

Vercel's registration forms can accept another contact email and trigger ICANN
verification, but that alone is not written authorization to buy and resell
domains to third parties
([registrant verification](https://vercel.com/kb/guide/update-icann-domain-information-for-vercel-domain)).
Vercel also publishes domain-operation webhooks for transfers, renewals,
certificates, DNS changes, and project-domain management
([domain webhook announcement](https://vercel.com/changelog/new-webhook-events-for-domain-management)).
Those events improve observability but do not override the contractual resale
restriction.

**Conclusion:** use Vercel to attach and host domains bought through
GO54/Openprovider. Do not resell Vercel-registered domains without a negotiated
agreement that expressly covers resale, registrant ownership, portfolio
recovery, support, and pricing.

### 8. IONOS — exclude; public API is DNS/hosting, not registrar resale

IONOS's public developer portal exposes DNS zone and record CRUD for domains in
an IONOS account
([DNS API](https://developer.hosting.ionos.com/docs/dns)). Official domain
ordering material describes interactive ordering through an IONOS contract and
control panel
([domain ordering](https://www.ionos.com/help/domains/ordering-a-domain-find-the-right-domain/ordering-a-domain-as-a-11-ionos-customer/)).
No official registrar purchase API, customer-subaccount model, reseller
programme, or registrar sandbox was found. IONOS should not be shortlisted for
embedded domain purchasing.

### Global-provider summary

| Provider | True reseller fit | API / sandbox | Lifecycle depth | Key constraint | Decision |
| --- | --- | --- | --- | --- | --- |
| **Openprovider** | Explicit reseller + SaaS embedding | REST/JSON, OpenAPI; OT&E currently impaired, replacement expected 2026-07-27 | Register, renew, transfer, EPP, contacts, nameservers, DNS/DNSSEC, WHOIS, webhooks | Working sandbox is a launch gate; optional Membership for best economics | **Primary if sandbox spike passes** |
| **OpenSRS** | Explicit white-label reseller/sub-reseller | XML API, strong Horizon test, queued events | Mature registrar, DNS, customer tooling | $95 credit activation, older protocol, IP allowlist | **Fallback / immediate substitute** |
| **Namecheap** | API resale explicitly allowed | XML API, free sandbox | Good common lifecycle; restricted API transfer TLDs | Production eligibility and IPv4 allowlist; no general webhooks | Secondary alternative |
| **GoDaddy** | Yes, only selected API Resellers | Modern multi-version REST APIs | Deep customer-scoped lifecycle | Enterprise selection + certification; Basic/Pro cannot use purchase APIs | Future negotiation |
| **Enom** | Explicit reseller/subaccounts | Older API | Mature registrar operations | Same Tucows parent as OpenSRS; less attractive current integration | Not preferred |
| **Cloudflare** | No public white-label programme | Beta REST + sandbox endpoints | Search/price/register, but incomplete registrar lifecycle | 100-domain cap, limited API TLDs, forced Cloudflare NS | Not for resale launch |
| **Vercel** | No public reseller programme; API Terms restrict third-party resale | Modern REST + domain webhooks; no registrar sandbox documented | Deep purchase/renew/transfer/NS API | Account/team ownership and resale restriction | Hosting/attachment only |
| **IONOS** | No registrar reseller evidence | DNS API only | No programmatic registrar purchase | Interactive contract/account ordering | Exclude |

## Recommended provider acceptance spike

Run the same black-box test suite against GO54 and Openprovider before writing
the production integration. Run it against ConnectReseller and OpenSRS before
claiming failover readiness.

For Openprovider specifically, first verify that the replacement OT&E
environment announced for July 27, 2026 is live and stable. If it is not, move
the global launch spike to OpenSRS rather than testing against production.

1. **Catalogue**
   - fetch supported TLDs;
   - fetch registration, renewal, transfer, and restore prices;
   - confirm currency, taxes/fees, premium flags, and price validity window.
2. **Availability**
   - exact `.com.ng` and `.com` checks;
   - invalid, premium, reserved, IDN, and unavailable names;
   - stale-price and race-condition behaviour.
3. **Registration**
   - merchant as registrant;
   - EwaTrade technical contact only where allowed;
   - explicit legal-consent evidence;
   - custom nameservers;
   - duplicate request and network-timeout replay.
4. **Verification and DNS**
   - registrant email verification;
   - A, AAAA, CNAME, TXT, MX, CAA, and NS records;
   - Vercel verification TXT/CNAME and storefront routing;
   - DNSSEC enablement and DS publication.
5. **Lifecycle**
   - auto-renew toggle;
   - manual renewal;
   - contact and nameserver update;
   - lock/unlock;
   - inbound transfer;
   - EPP/auth-code retrieval and transfer-out;
   - expiration, grace, redemption/restore, and deletion status mapping.
6. **Operations**
   - webhook signature/replay if supported;
   - status polling and reconciliation;
   - rate limits and `429` handling;
   - provider `5xx` retry policy;
   - insufficient wallet balance;
   - provider cancellation/refund behaviour;
   - support escalation drill.

The spike passes only if the provider operation can be safely retried without a
second registration or second charge, or EwaTrade can deterministically
reconcile an ambiguous result before retrying.

## Integration implications for the later implementation plan

The user experience should be provider-neutral:

1. Merchant searches a name.
2. EwaTrade displays an exact, short-lived quote with initial and renewal price.
3. Merchant enters/accepts registrant details and legal terms.
4. EwaTrade collects payment and creates a durable purchase intent.
5. A background job registers the domain using a provider-specific adapter.
6. EwaTrade configures DNS and connects the domain to the merchant storefront.
7. The app/dashboard shows `pending verification`, `configuring`, `active`, or
   an actionable failure state.
8. Renewal, transfer-out, contact changes, and DNS remain self-service.

Provider abstractions should include at least:

- `searchAvailability`
- `quote`
- `register`
- `getOperation`
- `getDomain`
- `renew`
- `setAutoRenew`
- `get/updateContacts`
- `get/updateNameservers`
- `get/updateDnsRecords`
- `get/setDnssec`
- `lock/unlock`
- `transferIn`
- `getAuthCode`
- `restore`

Do not attempt an automatic cross-registrar retry after an ambiguous registration
timeout. First reconcile with the original registrar and registry; otherwise
EwaTrade can double-charge or register the same customer intent through the
wrong ownership path.

Keep authoritative DNS logically separate from registration. For launch,
registrar DNS may be simpler, but the EwaTrade data model should treat
`registrarProvider` and `dnsProvider` as separate fields. This permits a later
move to Cloudflare DNS without transferring the domain.

## Commercial model guardrails

- Quote domains with a short expiry and re-check price immediately before
  provider purchase.
- Show renewal price at purchase; never market only the promotional first-year
  price.
- Maintain a reserve/wallet threshold large enough for renewals even during a
  payment-provider incident.
- Bill and record registration, renewal, restoration, and transfer as separate
  products.
- Do not promise refunds after successful registration; registries generally
  treat successful registrations as final.
- Add margin for FX, payment fees, support, fraud, chargebacks, and restore
  exposure, not only the registrar's nominal price.
- Keep merchant registrant data exportable and provide a self-service
  transfer-out/auth-code path subject only to registry locks and fraud controls.

## Final recommendation

Proceed to commercial and technical onboarding with:

1. **GO54 for `.com.ng`**;
2. **Openprovider for global TLDs, only after its replacement sandbox passes
   the spike**;
3. **ConnectReseller as the independent `.com.ng` fallback**; and
4. **OpenSRS as the global fallback**.

Before implementation begins, obtain provider contracts, production and test
credentials, the complete TLD/price feeds, and written answers to the
non-negotiable gates. If GO54 cannot supply staging, merchant-as-registrant
assurance, DNSSEC details, and a usable escalation path promptly, promote
ConnectReseller to the `.com.ng` launch provider. If Openprovider's replacement
sandbox is unavailable, its commercial terms or support commitments do not pass
review, or the spike cannot safely exercise the lifecycle, launch global domains
on OpenSRS rather than Vercel/Cloudflare.

## Primary-source index

### Registry

- [NiRA home and 3R model](https://www.nira.org.ng/)
- [NiRA accredited registrar directory](https://nira.org.ng/business-directory/accredited_category/registrars/)
- [NiRA registrar accreditation policy](https://nira.org.ng/pdf/NiRA-Registrars-Accreditation-Policy-1.pdf)
- [NiRA registrar agreement](https://nira.org.ng/pdf/NIRA-REGISTRAR-AGREEMENT.pdf)
- [NiRA domain lifecycle notice](https://nira.org.ng/nira-media-news-update-362-ng-domains-have-a-life/)
- [NiRA WHOIS redaction announcement](https://nira.org.ng/a-presidential-note-of-appreciation-and-reflection-on-niras-17th-agm/)
- [NiRA DNSSEC implementation report](https://nira.org.ng/nira-17th-agm-and-new-executive-board-of-directors/)

### Nigerian / `.com.ng` providers

- [GO54 reseller programme](https://whogohost.com/index.php/domains/domain-reseller)
- [GO54 API documentation](https://api-docs.go54.com/)
- [GO54 API staging/live structure](https://api-docs.go54.com/api-reference/general/domain/api-structure)
- [GO54 retail domain pricing](https://whogohost.com/solutions/domains/domain-registration)
- [ConnectReseller pricing](https://www.connectreseller.com/domain-prices/)
- [ConnectReseller tier system](https://www.connectreseller.com/tier-system/)
- [ConnectReseller API/integration options](https://www.connectreseller.com/integration-options/)
- [ConnectReseller domains and DNS knowledge base](https://helpdesk.connectreseller.com/portal/en/kb/support/domains-and-dns)
- [Upperlink reseller programme and rates](https://domains.upperlink.ng/domain-name-resellers/)
- [Upperlink WHMCS/API module setup](https://client.upperlink.ng/clients/knowledgebase/50/How-to-install-the-our-whmcs-registrar-module.html)
- [HOSTAFRICA domain reseller API](https://my.hostafrica.com/resellerinfo.html)
- [HOSTAFRICA API integration setup](https://help.hostafrica.com/article/hostafrica-domain-reseller-for-whmcs)
- [HOSTAFRICA acquisition of GO54](https://www.hostafrica.com/wp-content/uploads/2025/01/HOSTAFRICA-GO54_Acquisition_-PR.pdf)
- [QServers domain reseller slabs](https://process.qservers.net/cart.php?gid=20)
- [QServers `.ng` pricing notice](https://process.qservers.net/index.php?rp=%2Fannouncements%2F105)

### Global providers

- [Openprovider reseller API](https://developers.openprovider.com/)
- [Openprovider API reference](https://docs.openprovider.com/)
- [Openprovider webhook notifications](https://support.openprovider.eu/hc/en-us/articles/34308521422610-Webhook-Notification-System)
- [Openprovider sandbox status](https://support.openprovider.eu/hc/en-us/articles/8095671860114-Sandbox-Testing-Environment)
- [Openprovider Membership plans](https://www.openprovider.com/membership-plans)
- [Openprovider domain pricing](https://www.openprovider.com/domains/domain-prices)
- [Openprovider reseller terms](https://www.openprovider.com/legal/terms-conditions)
- [OpenSRS reseller access models](https://support.opensrs.com/support/solutions/articles/201000063497)
- [OpenSRS quickstart and Horizon test environment](https://support.opensrs.com/support/solutions/articles/201000063408)
- [OpenSRS Domains API event queue](https://support.opensrs.com/support/solutions/articles/201000063405)
- [OpenSRS Storefront webhook notifications](https://support.opensrs.com/support/solutions/articles/201000127705-storefront-webhook-notifications)
- [OpenSRS XML API](https://www.opensrs.com/wp-content/uploads/opensrs_xmlapi.pdf)
- [OpenSRS payment terms](https://opensrs.com/payment-terms/)
- [OpenSRS domain pricing](https://opensrs.com/domains/pricing/)
- [Namecheap API introduction and sandbox](https://www.namecheap.com/support/api/intro/)
- [Namecheap API FAQ, production eligibility, and rate limits](https://www.namecheap.com/support/knowledgebase/article.aspx/9739/63/api-faq/)
- [Namecheap API methods](https://www.namecheap.com/support/api/methods/)
- [GoDaddy API reseller plan comparison](https://www.godaddy.com/en-uk/help/how-do-api-reseller-and-turnkey-reseller-plans-differ-7940)
- [GoDaddy Domains API](https://developer.godaddy.com/en/docs/api-users)
- [Enom reseller programme](https://www.enom.com/reseller/sell-domain-names/)
- [Enom reseller onboarding and sign-up fee](https://support.enom.com/support/solutions/articles/201000065296-becoming-an-enom-reseller)
- [Cloudflare Registrar API](https://developers.cloudflare.com/registrar/registrar-api/)
- [Vercel Domains Registrar API](https://vercel.com/docs/domains/registrar-api)
- [Vercel API Terms](https://vercel.com/legal/api-terms)
- [Vercel Domain Name Terms](https://vercel.com/legal/domain-name-registration-and-services-terms)
- [Vercel domain webhook events](https://vercel.com/changelog/new-webhook-events-for-domain-management)
- [IONOS DNS API](https://developer.hosting.ionos.com/docs/dns)

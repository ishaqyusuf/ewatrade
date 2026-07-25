# Domain provider primary-source review

Date: 2026-07-24  
Scope: embedded domain search, purchase, renewal, transfer, and DNS management
for EwaTrade's mobile app and web dashboard.

## Executive conclusion

Use a registrar adapter with separate provider routes:

- **Nigeria route (`.com.ng`)**: start with **GO54 / WhoGoHost** and keep
  **ConnectReseller / OwnRegistrar** as the contracted fallback.
- **Global route (`.com`, `.org`, `.net`, and similar)**: start commercial and
  technical due diligence with **Openprovider**, with **OpenSRS** as the mature
  operational fallback. Openprovider's sandbox is, however, currently subject
  to a first-party outage notice, so it must not pass the launch gate until a
  full test purchase succeeds.
- **Deployment**: Vercel remains suitable for hosting and attaching domains,
  but its registrar API is not a safe embedded-resale choice without a written
  commercial exception.
- **DNS**: Cloudflare DNS can still be evaluated separately. Cloudflare
  Registrar is not lifecycle-complete enough for launch and does not currently
  list `.com.ng`.

This is not yet a procurement approval. Both recommended `.com.ng` providers
still require written confirmation of merchant-as-registrant ownership,
reseller rights, live wholesale pricing, API reliability semantics, and
support escalation.

## Shortlist

| Provider | Role | API fit | Commercial fit | Launch verdict |
| --- | --- | --- | --- | --- |
| GO54 / WhoGoHost | Primary `.com.ng` | Public API covers availability, register, renew, transfer, EPP, contacts, locks, and nameservers | Explicit, free reseller programme; NGN funding and local support | **Best Nigeria-first primary**, conditional on staging and contract checks |
| ConnectReseller / OwnRegistrar | `.com.ng` fallback; possible global consolidation | Public API document covers availability/pricing, register, renew, transfer, nameservers, auth code, locks, contacts, and DNS records | Explicit white-label reseller platform; OwnRegistrar appears in NiRA's accredited directory | **Best price-transparent fallback**, conditional on sandbox/webhook and support checks |
| Openprovider | Global primary candidate | OpenAPI REST API; register, renew, transfer, bulk, DNS, DNSSEC, WHOIS; OT&E advertised | Explicitly addresses SaaS builders and white-label embedding | **Best global product fit**, but its current sandbox outage is a launch blocker until retested |
| OpenSRS | Global fallback | Mature Domains API, asynchronous processing, event polling, managed operations | Explicit reseller model and custom end-user interface | **Best mature operational fallback**; production XML/IP-allowlist integration is less ergonomic |
| Vercel Domains Registrar | Hosting-adjacent only | Technically broad and modern | API terms restrict helping third parties resell/distribute Vercel services unless expressly permitted | **Do not use for embedded resale without written Vercel approval** |
| Cloudflare Registrar | DNS-adjacent future candidate | Beta supports search, authoritative availability/price check, and registration | No public registrar-reseller programme located | **Not launch-ready**: no renewal, transfer, or contact-update API; fixed Cloudflare nameservers |

## Vercel: technically capable, contractually unsuitable by default

Vercel now exposes a real registrar API. Its official API specification and
reference document endpoints for:

- supported TLDs and TLD price;
- single and bulk domain availability;
- domain-specific price;
- single and bulk purchase;
- inbound transfer and transfer status;
- renewal and auto-renew updates;
- outbound auth-code retrieval; and
- nameserver updates.

The purchase endpoint accepts an expected price, term, auto-renew setting, and
the customer's contact information. Requests can be scoped to a Vercel team.
See the [buy-domain reference](https://vercel.com/docs/rest-api/domains-registrar/buy-a-domain),
[domain-price reference](https://vercel.com/docs/rest-api/domains-registrar/get-price-data-for-a-domain),
and [official OpenAPI specification](https://openapi.vercel.sh/).

The blocker is the contract, not the endpoint coverage. Vercel's
[API Terms](https://vercel.com/legal/api-terms) grant limited internal/API
application rights and prohibit assisting a third party to resell or distribute
the Services through the API except where expressly permitted. No public
registrar reseller or white-label programme was located during this review.

**Decision:** use Vercel to deploy storefronts and attach already-owned domains.
Do not use its registrar API to sell domains to merchants unless Vercel provides
a signed amendment or other written permission that explicitly covers:

1. third-party domain resale inside EwaTrade;
2. the merchant as the legal registrant;
3. per-merchant contact data and transfer-out rights;
4. pricing/margin treatment; and
5. domain recovery if the EwaTrade Vercel team is suspended or terminated.

## Cloudflare: useful DNS, incomplete registrar API

Cloudflare's Registrar API is an official **beta**. It supports keyword search,
a real-time registry-backed availability/price check (up to 20 domains per
request), and programmatic registration. Registrations use the account's
payment method and default registrant contact unless a different registrant is
provided inline. The API supports synchronous and asynchronous registration
responses with status polling. See the
[Registrar API beta guide](https://developers.cloudflare.com/registrar/registrar-api/).

The same guide explicitly lists these current limitations:

- only a subset of Cloudflare Registrar TLDs are available through the API;
- renewals are not available through the API;
- transfers are not available through the API; and
- contact updates are not available through the API.

Cloudflare Registrar also requires Cloudflare authoritative nameservers; the
nameservers cannot be changed to another DNS provider while the domain remains
with Cloudflare Registrar. It does not support IDNs. See the
[registration restrictions](https://developers.cloudflare.com/registrar/get-started/register-domain/)
and [Registrar FAQ](https://developers.cloudflare.com/registrar/faq/).

Cloudflare says the dashboard registrar supports more than 400 TLDs, but the API
supports a smaller subset. `.com.ng` and `.ng` were not present in the official
[current TLD policy list](https://www.cloudflare.com/tld-policies/) on the
review date, and the API guide does not yet publish its smaller supported-TLD
list.

No public Cloudflare Registrar reseller/white-label programme was located.
Cloudflare's partner and multi-tenant products do not themselves prove that
registrations may be resold.

**Decision:** do not use Cloudflare Registrar for launch. Cloudflare DNS remains
a separate candidate where registrar nameserver changes are allowed. Ask
Cloudflare sales about reseller rights only as future due diligence, after the
API adds renewal, transfer, and contact management.

## Global registrar/reseller APIs

### Openprovider: recommended global primary candidate

Openprovider explicitly markets an OpenAPI-compliant REST API to resellers,
developers, and "SaaS builders" embedding domains in their own product. Its
first-party API page claims more than 2,000 TLDs and lists registration,
renewal, transfer, bulk operations, DNS, DNSSEC, and WHOIS. It also advertises
bearer-token authentication and a full isolated OT&E environment. See the
[Openprovider developer page](https://developers.openprovider.com/).

The commercial model is explicitly reseller-oriented. A free account receives
retail rates; paid Membership tiers unlock cost-price domains. Current published
entry tiers begin with free signup and a Basic S tier advertised at US$4.16 per
month when billed annually. Operations allowances and prices vary by tier; they
must be modelled as vendor costs, not customer-facing commitments. See the
[Openprovider membership and pricing page](https://www.openprovider.com/).

There is a current operational contradiction that must block production
selection until tested:

- the developer page advertises a full OT&E sandbox;
- the first-party
  [sandbox support notice](https://support.openprovider.eu/hc/en-us/articles/8095671860114-Sandbox-Testing-Environment)
  says the sandbox is not functioning properly, with a replacement expected on
  July 27, 2026.

That support notice also says transfers are not supported in the sandbox and
not every TLD is available there. `.com` is listed as supported; `.com.ng` is
not listed.

**Acceptance gates:** prove the repaired sandbox, then prove a low-risk live
`.com` registration, DNS/nameserver setup, contact ownership, renewal, auth-code
retrieval, and transfer-out. Obtain current per-operation Membership rules,
webhook/event documentation, idempotency/retry rules, charge reversal behavior,
and support SLAs in writing.

### OpenSRS: recommended mature global fallback

OpenSRS explicitly serves resellers. Its full-access model lets resellers
automate provisioning through an API and expose a custom management interface
to end users. Production API access requires an API key and server IP
allowlisting. See [OpenSRS access models](https://support.opensrs.com/support/solutions/articles/201000063497)
and the [Domains API guide](https://support.opensrs.com/support/solutions/articles/201000063416-opensrs-api-guides).

Every reseller receives access to the Horizon test system. It provides US$5,000
of test credit and mirrors most production domain behavior without creating
real domains. Limitations include no transfers, no real email, no billing, and
no name-suggestion tool. See the
[Horizon test-system guide](https://support.opensrs.com/support/solutions/articles/201000063061-horizon-test-system-accounts).

The public Storefront TLD list includes `.com`, `.org`, `.net`, and many common
global/ccTLD options, but does not include `.com.ng` as of this review. See the
[current OpenSRS TLD list](https://support.opensrs.com/support/solutions/articles/201000063020-currently-offered-tlds).

**Decision:** strong global fallback, especially if Openprovider's sandbox or
support is not ready. It is not the `.com.ng` choice without written confirmation.

## `.com.ng` legal and ownership shape

NiRA operates the `.ng` registry. Its registrar agreement defines:

- a **registrant** as the domain licence holder/applicant;
- registrar services as registration, maintenance, transfer, modification,
  renewal, and cancellation on behalf of a registrant; and
- a **reseller** as a person appointed by a registrar to sell domain services
  on its behalf.

The same agreement requires registrars to bind each registrant to the applicable
registrant agreements, submit/update registrant data, and ensure that a
registrant can easily transfer to another registrar. See the
[NiRA Registrar Agreement](https://nira.org.ng/pdf/NIRA-REGISTRAR-AGREEMENT.pdf).

The launch structure should therefore be:

> NiRA registry → NiRA-accredited registrar → EwaTrade as authorized reseller
> or agent → merchant as registrant.

The merchant must not be represented in registry records by a generic EwaTrade
employee or platform account. EwaTrade may be billing or technical contact only
where the registrar and registry rules permit it.

NiRA's current accredited-registrar directory lists both
**GO54 Limited (formerly WhoGoHost Limited)** and **OwnRegistrar Inc.**, with the
OwnRegistrar entry linking to ConnectReseller. See the
[NiRA accredited registrar directory](https://nira.org.ng/business-directory/accredited_category/registrars/).

## Nigerian option 1: GO54 / WhoGoHost

### Why it ranks first

GO54 is locally accredited, explicitly offers a domain reseller programme, uses
an advance-funded balance, supports NGN commercial operations, and publishes a
domain API that includes `.com.ng`.

The reseller page says:

- there is no reseller signup fee;
- resellers can set their own prices and brand;
- API integration is supported; and
- support is advertised as 24/7.

See the [GO54 domain reseller programme](https://whogohost.com/domains/domain-reseller/)
and [reseller knowledge-base category](https://whogohost.com/host/knowledgebase/22/Domain-Resellers).

### Documented API coverage

The current [GO54 API introduction](https://api-docs.go54.com/api-reference/introduction)
lists:

- availability search;
- registration and renewal;
- inbound transfer;
- EPP/auth-code retrieval;
- contact retrieval and update;
- transfer/domain synchronization;
- registrar-lock retrieval and update; and
- nameserver retrieval and update.

The
[availability endpoint](https://api-docs.go54.com/api-reference/endpoint/domain/Check%20Domain%20Availability%20of%20a%20Domain)
shows `.com.ng` alongside `.com`. The
[registration endpoint](https://api-docs.go54.com/api-reference/endpoint/domain/Register%20Domain)
accepts separate registrant, administrative, technical, and billing contacts,
custom nameservers, DNS management, and optional identity protection.

Authentication is not standard OAuth: GO54 supplies an API key and requests use
a time-derived HMAC token based on the account email. Keep this strictly in the
server-side provider adapter. See the
[GO54 authorization guide](https://api-docs.go54.com/api-reference/general/domain/authentication).

Staging exists only through support-assisted onboarding; the public
[API structure guide](https://api-docs.go54.com/api-reference/general/domain/api-structure)
instructs developers to contact support for staging details.

### Public pricing and funding

On the review date, the official public retail table showed:

| `.com.ng` operation | Public GO54 retail price |
| --- | ---: |
| One-year registration | ₦3,000 |
| Renewal | ₦7,200 |
| Transfer | ₦7,200 |

Source: [GO54 domain registration pricing](https://whogohost.com/domains/domain-registration/).

These are **retail**, not wholesale reseller, prices and may be promotional.
The reseller programme advertises discounted pricing but does not publish the
reseller rate. GO54 uses an advance-deposit balance, so EwaTrade needs a
low-balance monitor and automatic funding escalation.

### Unknowns requiring written confirmation

No public documentation was located for:

- reseller wholesale `.com.ng` register/renew/transfer/restore prices;
- lifecycle webhooks;
- API idempotency keys and duplicate-charge handling;
- rate limits;
- a domain API uptime or response-time SLA;
- `.com.ng` DNSSEC/DS management through the API;
- whether paid identity protection adds anything beyond NiRA's registry policy;
- automated redemption/restoration; or
- an incident escalation matrix.

**GO54 launch verdict:** best primary if it supplies staging access, the
wholesale price feed, written merchant-as-registrant/resale terms, DNSSEC and
restore answers, and a successful end-to-end test.

## Nigerian option 2: ConnectReseller / OwnRegistrar

### Why it ranks second

NiRA lists OwnRegistrar as accredited and links it to ConnectReseller.
ConnectReseller describes itself as OwnRegistrar's reseller arm and explicitly
supports white-label reseller platforms. See
[ConnectReseller about](https://www.connectreseller.com/about-us/).

The entry tier starts at US$0 in prior-month receipts; the next tiers are earned
at 100 registrations or US$500 receipts, then 500 registrations or US$2,500
receipts. See the [tier system](https://www.connectreseller.com/tier-system/).

### Documented API coverage

The public
[ConnectReseller API v11 PDF](https://www.connectreseller.com/resources/downloads/CR_API_Document_V11.pdf)
documents:

- single and bulk availability checks (up to 200 domains);
- name and TLD suggestions;
- current registration, renewal, transfer, and multi-year price lookup;
- full TLD price sync;
- registration for a specific customer with custom nameservers;
- inbound transfer, transfer validation/cancellation, and renewal;
- domain details and search;
- nameserver and auth-code changes;
- locks, privacy, theft protection, and suspension;
- DNS management and A/CNAME/MX/TXT/SRV record operations;
- registrant/contact creation and update; and
- customer, child-nameserver, and forwarding operations.

The availability response includes register, renew, and transfer prices. This
is materially better for quote construction than relying on a scraped retail
page.

The PDF places the API key in a query parameter. EwaTrade must ensure URLs are
never logged, traced, or sent to analytics with that key, and all calls must
remain backend-only.

The provider's help centre documents DNSSEC, restoration, nameserver changes,
auth-code management, and domain lifecycle in the control panel. Those panel
features do **not** prove equivalent API coverage. See the
[ConnectReseller Domains and DNS knowledge base](https://helpdesk.connectreseller.com/portal/en/kb/support/domains-and-dns).

### Public pricing and funding

The current entry-tier price list shows:

| `.com.ng` operation | ConnectReseller Tier 1 |
| --- | ---: |
| Registration | US$4.89 |
| Renewal | US$4.89 |
| Transfer | US$4.89 |
| Restoration | US$99 |

Higher tiers currently show US$4.79 and US$4.59 for register/renew/transfer.
Source: [ConnectReseller domain prices](https://www.connectreseller.com/domain-prices/).

Global card funding incurs 4.4% + US$0.30, deducted from the amount credited.
Payoneer and Zelle require sales contact. See
[ConnectReseller payment options](https://www.connectreseller.com/payment-options/).
These funding costs must be included in EwaTrade's cost basis.

### Unknowns requiring written confirmation

Neither the public API PDF nor the integration page documents:

- a sandbox or OT&E environment;
- lifecycle webhooks;
- API idempotency or retry guarantees;
- rate limits;
- restoration through API;
- DNSSEC/DS management through API;
- a domain API SLA; or
- `.com.ng`-specific support/escalation targets.

The public PDF is broad but dated November 4, 2025 and contains awkward GET
operations for mutations. Contract tests and security review are mandatory.

**ConnectReseller launch verdict:** best fallback because accreditation,
white-label intent, lifecycle breadth, and pricing are unusually transparent.
Do not enable automatic production purchases until sandbox/test procedures,
webhook/polling behavior, and reseller-support escalation are confirmed.

## Provider acceptance questions

Send the same written questionnaire to GO54, ConnectReseller, Openprovider, and
OpenSRS where applicable:

1. May EwaTrade resell registrations inside its own mobile and web applications
   under its own brand?
2. Will each merchant's legal entity/person be the registry registrant, with
   EwaTrade only as reseller/billing/technical agent?
3. Can EwaTrade create and update unique registrant contacts for every merchant?
4. Can the merchant obtain the auth/EPP code and transfer out without an
   EwaTrade-specific fee or provider lock-in?
5. Supply machine-readable register, renewal, transfer, redemption/restore,
   privacy, premium-domain, and DNS costs, plus price-change notice terms.
6. Document rate limits, idempotency behavior, timeout/retry rules, duplicate
   charge resolution, and registration reconciliation.
7. Document sandbox/test behavior, lifecycle webhooks or polling contracts, and
   terminal states for asynchronous operations.
8. Confirm `.com.ng` DNSSEC support, DS algorithms, and whether DS records are
   managed by API.
9. Confirm WHOIS/RDDS privacy and registrant-verification responsibilities.
10. Provide support hours, severity levels, incident notifications, escalation
    contacts, and response-time commitments.
11. Explain domain recovery and transfer rights if EwaTrade's reseller account
    is suspended, terminated, underfunded, or disputed.
12. Explain chargeback, fraud, abuse, and registration-refund rules.

## Recommendation confidence

- **High confidence:** Vercel has a capable registrar API but default API terms
  block an assumed resale use; Cloudflare's beta lacks lifecycle APIs; GO54 and
  OwnRegistrar are listed by NiRA; GO54 and ConnectReseller publicly document
  the core registration lifecycle.
- **Medium confidence:** GO54 is the best Nigeria-first operational fit and
  ConnectReseller is the best fallback. Final ranking can change after wholesale
  quotes, sandbox tests, and support terms.
- **Conditional:** Openprovider is the best global product/API fit, but its
  current sandbox outage must be cleared. OpenSRS is the safer mature fallback.


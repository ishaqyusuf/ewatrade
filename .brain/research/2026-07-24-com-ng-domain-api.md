# `.com.ng` domain API: launch recommendation

Date: 2026-07-24

## TL;DR

Use **GO54 / WhoGoHost** for EwaTrade's Nigeria-first launch. It is NiRA
accredited, explicitly supports `.com.ng` in its reseller programme, bills in
naira, is free to join, and publishes an API for registration, renewal,
transfer, EPP retrieval, DNS records, and nameserver management. Its current
public retail price is **₦3,000 registration / ₦7,200 renewal**; reseller cost
is discounted but only visible after activation.

The caveat is onboarding friction: GO54 must activate the reseller account and
issue the API key. Run a short integration spike before committing.

Use **ConnectReseller as the commercial fallback** if GO54 activation or
support is slow. It confirms `.com.ng` at **$4.89** for registration, renewal,
and transfer on its entry tier, with no setup fee or minimum commitment.
**Dynadot** is the developer-experience fallback: self-service API keys, REST
and legacy APIs, and a sandbox, but its public `.com.ng` price observed during
this review was €9.28.

## Comparison

| Provider | `.com.ng` confirmed | Registration and management API | DNS / nameservers | Entry and pricing | Verdict |
| --- | --- | --- | --- | --- | --- |
| **GO54 / WhoGoHost** | Yes, explicitly included in the `.ng` reseller family | Public JSON API covers register, renew, transfer, contacts, EPP, lock and sync | API covers get/save DNS records and get/change nameservers | Free reseller signup; funded balance; API key issued after activation. Retail is public in NGN, but wholesale reseller rates require an account | **Best Nigeria-first launch choice** |
| **ConnectReseller / OwnRegistrar** | Yes; public price list includes `.com.ng` | Public integration material advertises 300+ commands for registration, renewal, transfer, and bulk operations | DNS and nameserver management documented | No setup/yearly fee or minimum commitment; Tier 1 is $4.89 register/renew/transfer | **Best price-transparent global fallback** |
| **Dynadot** | Yes; dedicated `.COM.NG` product page | REST and legacy APIs cover search, register, renew, transfer and portfolio management; sandbox available | API covers DNS and nameserver operations | API is available to all accounts; reseller setup is free with no minimum deposit or quota. Public TLD pricing is transparent | **Best developer-experience fallback** |
| **QServers** | Yes; NiRA-accredited local registrar | No public first-party domain registration API documentation found | Advanced DNS is available as a paid add-on | Reseller entry slabs start at ₦15,000; published `.com.ng` pricing is older and must be reconfirmed | Not suitable for a quick API integration unless sales supplies private docs |
| **ResellerClub / LogicBoxes** | **Not confirmed in current official public material** | Mature HTTP API supports domain search/register/renew and related lifecycle operations | DNS API and nameserver management documented | $25 usable deposit for base slab; larger deposits unlock better pricing | Do not select until `.com.ng` availability is confirmed in writing |

OpenSRS was also checked. It has a mature API, managed DNS, and a test
environment, but its current public Storefront TLD list does not include
`.com.ng`; do not select it without written confirmation.

## Recommended launch path

1. Open a GO54 domain reseller account and request API credentials plus current
   `.com.ng` wholesale registration, renewal, restore, and transfer prices.
2. Prove four operations in a non-production/test flow: availability,
   registration with EwaTrade-controlled nameservers, DNS update, and renewal.
3. Confirm ownership semantics in writing: the merchant must be the registrant,
   must be able to obtain the EPP/auth code, and must be able to transfer out.
4. Put GO54 behind a small provider interface. If the spike fails, implement
   the same interface with ConnectReseller rather than delaying launch.
5. Keep authoritative DNS separate from the registrar where practical (for
   example, Cloudflare DNS). The registrar API then handles registration and
   nameserver delegation; EwaTrade's DNS provider handles records.

Do **not** pursue direct NiRA accreditation for launch. NiRA requires a
registered company, membership and application documents, a non-refundable
application fee, training/certification, a registry deposit, annual
recertification, and successful interface, policy, and regulatory tests.
That is appropriate only after EwaTrade has meaningful domain volume.

## Primary sources

- GO54 / WhoGoHost: [reseller programme](https://whogohost.com/index.php/domains/domain-reseller), [supported reseller TLDs](https://whogohost.com/host/knowledgebase/242/What-domain-name-can-I-resell.html), [API introduction and authentication](https://www.whogohost.com/host/index.php?rp=%2Fknowledgebase%2F514%2FIntroduction.html), [API actions](https://www.whogohost.com/host/knowledgebase/111/Domain-Reseller-API-actions), and [current retail domain table](https://www.whogohost.com/host/cart.php?a=add&domain=register).
- Dynadot: [`.COM.NG` support and pricing](https://www.dynadot.com/domain/com.ng), [API overview](https://www.dynadot.com/domain/api), [REST API documentation](https://www.dynadot.com/domain/api-document), [API-key and sandbox setup](https://www.dynadot.com/help/question/find-API-settings/), and [reseller programme](https://www.dynadot.com/domain/reseller-program).
- ConnectReseller: [domain prices](https://www.connectreseller.com/domain-prices/), [tier system](https://www.connectreseller.com/tier-system/), [integration options](https://www.connectreseller.com/integration-options/), and [DNS/API knowledge base](https://helpdesk.connectreseller.com/portal/en/kb/support/domains-and-dns).
- QServers: [reseller plans](https://process.qservers.net/cart.php?gid=20), [published `.com.ng` price notice](https://process.qservers.net/index.php?rp=%2Fannouncements%2F105), and [DNS add-on](https://process.qservers.net/index.php?rp=%2Fstore%2Fextras).
- ResellerClub: [HTTP API](https://manage.resellerclub.com/kb/answer/744), [domain API calls](https://manage.resellerclub.com/kb/answer/751), [DNS service](https://manage.resellerclub.com/kb/servlet/KBServlet/faq580.html), and [deposit/slab pricing](https://www.resellerclub.com/domain-reseller/domain-name-registration).
- OpenSRS: [domain API guide](https://support.opensrs.com/support/solutions/articles/201000063416-opensrs-api-guides), [reseller access models](https://support.opensrs.com/support/solutions/articles/201000063497), and [currently offered Storefront TLDs](https://support.opensrs.com/support/solutions/articles/201000063020-currently-offered-tlds).
- NiRA: [accredited registrar directory](https://nira.org.ng/business-directory/accredited_category/registrars/), [becoming an accredited registrar](https://nira.org.ng/pdf/Becoming_a_NIRA_Registrar.pdf), and [registrar accreditation policy](https://nira.org.ng/pdf/NiRA-Registrars-Accreditation-Policy-1.pdf).

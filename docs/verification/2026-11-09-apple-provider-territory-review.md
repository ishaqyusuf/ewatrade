# Apple availability and provider-country review — 9 November 2026

Status: actual availability read; proposed adjustment requires owner decision.
No Apple availability, subscription, price, provider or runtime setting changed.
This is not submission approval. Apple remains2/6; Android has its own ledger.

## Actual Apple observation

Following the owner's completed sign-in, App Store Connect showed the correct
EwaTrade app6815837585 under the existing company account. iOS1.0.0 remains
Prepare for Submission. Pricing and Availability showed **175 Available**; its
expanded country table contained175 unique countries/regions. The actual set
equals the175 country names in the existing
[525-row price table](../billing/apple-regional-prices-2026-11-07.csv), not merely
the same count. Observation recorded at16:58:57Z /17:58:57 Africa/Lagos.

The app download price is free; the separate owner subscriptions are paid. No
free-first launch decision follows from Apple's app-download price. Public
distribution is selected; Apple Silicon Mac and Vision Pro availability are off.
These observations do not establish final review, IAP approval or public release.

Private mode0600 DOM evidence:
`/private/tmp/ewatrade-apple-available-countries-2026-11-09.json`, SHA256
`7380d3a583d61e3a55388167f1e0e6a5bc196d7dbd4a872b6db1f20319f10bae`.
No credentials, account identifiers, hardware metadata or signed receipts are
copied into this packet.

## Exact provider-list difference

The current official [OpenAI API supported countries and territories](https://developers.openai.com/api/docs/supported-countries)
list warns against access or offering access outside its listed countries and
territories. Eleven actually enabled Apple storefronts are not explicitly named
there, including after the documented name aliases below:

- Anguilla
- Belarus
- British Virgin Islands
- China mainland
- Hong Kong
- Kosovo
- Macau
- Montserrat
- Russia
- Turks and Caicos Islands
- Venezuela

The offline comparison matched164 names against208 provider-list entries. Name
normalization covers Cape Verde/Cabo Verde, the two Congo names, Czech Republic/
Czechia, South Korea, Macau/Macao, Naoero/Nauru, Eswatini, the three St./Saint
names, Türkiye/Turkey, Ukraine's stated exceptions and United States. China
mainland/China still has no match. No parent-country/dependency equivalence is
assumed. Ukraine's provider exceptions require separate treatment.

Private comparison:
`/private/tmp/ewatrade-openai-apple-country-comparison-2026-11-09.json`.
Provider Markdown SHA256:
`5f774b4c4cbe8e7ee36db570e2c9be19c0d44a35df73716810ec7c6a7c074fa2`.
Existing price CSV SHA256:
`46fae0808c815b440977e053bf7a6788156af5fc07e7f4144a387e9b3fdb58e9`.

## Concrete recommendation and remaining boundary

Recommend excluding those eleven from the app's launch availability, yielding
164 named storefronts, while retaining the existing prices. This is a conservative
distribution recommendation inferred from the provider list, not a claim that a
storefront precisely determines a user's physical location or legal eligibility.
Review the three subscriptions' actual availability separately before proposing
any corresponding product-setting change; pricing rows alone do not establish it.

The owner's approval for eight Play exclusions does not authorize Apple's
different eleven-country change. No Apple change has been submitted or saved.
Store exclusions alone do not prove runtime geographic enforcement, settle
Ukraine's exceptions or establish all country-specific legal requirements.
Do not contact providers: the owner withdrew outreach and requested assessment
under applicable existing terms and actual processing flows.

## Verification and Brain impact

Read-only UI inspection and offline set equality establish only the observations
above. Focused documentation checks are recorded with the consolidated checkpoint;
no purchase, task invocation, native input, build or deployment is part of this
review. The local Brain Apple handoff records the same evidence and pending
decision; no API, schema, permission or product behavior changed.

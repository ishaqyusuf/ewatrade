# Apple availability and provider-country review — 9 November 2026

Status: **owner-approved eleven-storefront exclusion applied and read back for
the app and all three monthly subscriptions;164 selected on each**.
Automatic future countries are off on all four. No price controls were edited.
This is not submission approval. Apple is now3/6 under the canonical ledger;
Android has its own ledger.

## Initial Apple observation

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
territories. Eleven initially enabled Apple storefronts were not explicitly named
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

## Adopted recommendation and remaining boundary

The owner approved excluding those eleven from the app and all three
subscriptions' launch availability, yielding164 named storefronts, retaining
existing prices and setting automatic future-country availability off. This is a
conservative
distribution recommendation inferred from the provider list, not a claim that a
storefront precisely determines a user's physical location or legal eligibility.
Actual subscription availability was reviewed separately, as recorded below;
pricing rows alone are not the evidence for those product settings.

The earlier approval for eight Play exclusions did not authorize Apple's different
eleven-country change. Root obtained the exact separate Apple approval before
saving these settings. No app/product review submission or publication followed.
Store exclusions alone do not prove runtime geographic enforcement, settle
Ukraine's exceptions or establish all country-specific legal requirements.
Do not contact providers: the owner withdrew outreach and requested assessment
under applicable existing terms and actual processing flows.

## Initial subscription availability read

The earlier Starter dialog showed175 selected countries and automatic future
countries off. Root subsequently opened the actual Growth and Pro availability
dialogs, read their country-level checked states, and cancelled both without
changing a checkbox or saving. Each has175 selected countries and automatic future
countries off. Both extracted selected sets equal the existing175-country pricing
set after applying the documented Naoero/Nauru alias on both sides. No prices were
opened for editing or changed. Pro's closed-dialog summary still read all countries
or regions selected.

| Product | Apple ID | Initial selected countries | Automatic future countries |
| --- | --- | --- | --- |
| Starter | 6832036267 | 175, earlier actual dialog evidence reused | Off |
| Growth | 6832035627 | 175, actual country-level selection read | Off |
| Pro | 6832031107 | 175, actual country-level selection read | Off |

Growth/Pro observations were completed before the actual18:33:47UTC clock read;
the later closed-dialog readback confirms no saved change. Private mode0600 JSON
evidence is `/private/tmp/ewatrade-apple-growth-availability-2026-11-09.json` and
`/private/tmp/ewatrade-apple-pro-availability-2026-11-09.json`. The app's
automatic-future-country setting had not been measured by that initial follow-up;
the later actual observation and approved change are recorded below.

Root presented one exact owner decision for the app plus all three products:
exclude the eleven named storefronts, target164, preserve prices, future countries
off, no submission/publication. The owner replied **Approve the 11 exclusions for
app and subscriptions** to that exact question. The approved Play changes remain
separate.

## Approved change and persisted readback

Each subscription's confirmation listed exactly the eleven approved countries;
root confirmed once per product. The app confirmation specified removal in eleven
countries. The app's future-country checkbox was actually ON before this change;
root turned it OFF under the explicit approval. The three subscriptions were
already OFF. No price, duration, trial, sharing or review-submission control was
used. Root reopened each saved country dialog, verified its full175-country
checkbox set, and cancelled the readback dialog without further changes.

| Surface | Actual persisted readback UTC,9November | Selected | Excluded | Future countries |
| --- | --- | --- | --- | --- |
| Pro |19:07:03.084 |164 | exact approved11 | Off |
| Growth |19:08:35.667 |164 | exact approved11 | Off |
| Starter |19:10:15.940 |164 | exact approved11 | Off |
| App |19:13:46.856 |164 | exact approved11 | Off |

Offline comparison proves all four selected sets are identical to the accepted
175-country set minus exactly those eleven, with Naoero/Nauru normalization.
The app's saved summary shows Availability (164 Countries or Regions), with the
eleven rows Not Available and the retained rows Available on App Release.
This is configured launch availability, not a public release or proof that every
storefront cache has propagated. Apple's confirmation says changes take effect
within24hours; no publication was requested.

Private mode0600 readback JSON and screenshots are
`/private/tmp/ewatrade-apple-{app,starter,growth,pro}-availability-approved-2026-11-09.{json,png}`.
The original525-row price export remains unchanged at its SHA256 above; excluded
storefront prices remain historical/configured rows rather than being deleted.
No backend/runtime catalog, billing flag or private-key setting changed.

## Verification and Brain impact

Actual authorized UI saves, reopened persisted selections and offline exact-set
equality establish this country-setting checkpoint. No purchase, task invocation,
native input, build or deployment is part of this adjustment. The local Brain
Apple handoff records approval and readbacks; no API, schema or payment behavior
changed. This does not close I04/I05/I06 or prove runtime country enforcement.
Follow-up offline selected-set equality passes for Growth/Pro. Documentation uses
the already passed core51tests/254assertions and QA-tooling types from the same
unchanged tooling; owned diff/local-link and four-set/price-hash checks pass. No repeated
Starter device/provider case or broad whole-checkout approval is claimed.

# Jawdah remaining local QA checks — 28 October 2026

Owner explicitly authorized adding the QA image adapter, resolving QA service
booking policy and finishing mobile verification. No deployment/provider calls.
This supplements `2026-10-28-jawdah-storefront-flow.md`; its historical blocked
checkpoint remains evidence rather than a current final result.

## Source checkpoint

Catalog QA uses the existing private-media local file port, canonical upload
intent/byte receipt, Sharp processing and verdict command. `local_test` storage
is pinned to `store_localtest`. Only APP_ENV=local, DEV_PROFILE=local and
nonproduction NODE_ENV can select it. Server-derived database classification
chooses the transport. LIVE data retains Vercel storage and genuine review.

The registered test review provider `local_qa_fixture`, policy
`registered-fixtures-v1`, accepts only normalized digests of the two permanent
synthetic test PNGs under `packages/catalog/fixtures`. Unknown images reject.
These are simulated QA approvals, never live content-safety decisions. Local QA
review runs inline after byte verification, without jobs or a live model call.
Private previews and anonymous public delivery use the same current scope,
publication, review provenance, digest and provider-pin checks. QA derivatives
are processed locally and never enter LIVE derivative/cache/cleanup receipts.

The public projection helper import/filter landed in the concurrently owned
performance commit `5c8d39b3f`. That overlap is attributed to this Jawdah slice;
its matching adapter dependency is committed here. Other performance changes are
not claimed as this task's work or acceptance.

## QA service setup

Canonical `setServiceCommercePolicyDecision`, using the existing QA Owner actor,
created three SERVICE decisions: staff/web, web/intake and web/booking. Each is
revision1, restricted to the exact Jawdah QA Store and current Store jurisdiction,
with explicit QA simulation/owner authorization references and expiry
**29 October 2026,21:30 WAT**. No LIVE business, pharmacy, WhatsApp, payment,
provider or licence approval changed. The existing `createServiceRequestForm`
command created temporary form `cmvskjirl0007tt9kh0imiedz` over two existing
Service offerings with the same expiry. No new Product/Service fixture was made.

## Checks at source checkpoint

- Offline QA doctor passes (runtime not certified).
- Catalog package types, scoped DB graph and scoped API photo graph pass.
- Image tests:29pass/226assertions, including5new QA cases.
- Owned source smoke:224pass/1219assertions across42files; no unsupported mapping.
- Actual Dashboard multi-select/primary/save and positive Service request/mobile
  checks are in progress and will be recorded below after observing final state.

Private artifacts remain under `.scratch/jawdah-storefront/2026-10-28/`. No
capability URLs, sessions, OTPs, provider credentials or raw server logs committed.

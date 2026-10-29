# Jawdah storefront local acceptance — 28 October 2026

**29 October follow-up:** the three image, QA Service policy and phone operating
gates below are resolved locally. See [remaining-check acceptance](2026-10-28-jawdah-remaining-checks.md). The earlier dated checkpoint is retained for history.

Implementation is committed locally. The primary four-crate journey passed through
canonical payment verification. Full acceptance remains open for the operating
image and Service Commerce gates below. No push, deployment, real transfer,
provider message, fulfilment or dispatch occurred.

## Approved design and runtime

- Spec: `docs/plans/jawdah-storefront-end-to-end-spec.md`.
- Claude Opus 5.5/high delivered the approved companion direction
  `jawdah-commerce-flow`, exact revision `bb3a0821-c2a1-494d-8907-03ee3c81083c`.
- Jawdah Poultry QA uses **Commerce studio 1.2.0**, draft 4, local QA release
  `cmvshsn0h00029p9k98a5esn7`. Its previous Market hall release is retained.
- Owner-approved QA Growth entitlement; classification remains QA. Local test OTP
  adapter; existing fictional QA bank; no purchase or provider activation.
- Owner-approved API refresh and later dashboard/storefront-only refresh applied
  the template registry and Next 16.4.3. The dev-only Turbo environment passthrough
  keeps the registered test OTP adapter available. Production guards are unchanged.
- Shared features were subsequently moved by the owning extraction chat. Its
  forwarding template adapters and newer Workshop selection remain authoritative.

## Verified primary journey

Request **R-RAH6R3** became exactly one **ORD-061**. Four Small Crates at ₦4,500
produced ₦18,000 subtotal. Delivery was selected with no initial address. Merchant
notification/deep link, personal read acknowledgement, ask/reply and destination
collection worked. Missing destination blocked confirmation; zero was explicitly
accepted as free, negative fee refused, and ₦1,500 yielded **₦19,500** final total.

Before submission: 60 Orders, no storefront Order Requests, 9.2 Small Crates
available. Submission created a pending request without a new Order/payment.
Confirmation produced 61 Orders and 5.2 available Crates, reserving exactly four.
No fulfilment was performed.

The customer opened the canonical manual payment link from the storefront receipt.
A local QA simulation report entered **Checking** with amountPaid 0 and no posting.
Merchant verification recorded exactly one BANK_TRANSFER payment of 1,950,000 minor
units. Merchant, public payment page and original storefront receipt all showed
**Paid**, ₦19,500 paid and zero balance; the receipt hid its payment CTA. This tests
application reconciliation, not a real bank transfer or external delivery.

Payment report `cmvsjrb220007r89kmb9y2rhh` points to canonical payment
`cmvsjwqo80008r89kkh51ue5m`. Private receipt/payment capability URLs are excluded.

Reconfirming returned the same Order. A different decision on the already
confirmed report refused with CONFLICT. Before/after facts stayed 61 Orders,
one payment and 5.2 Crates. Foreign-Store notifications returned no rows and
refused acknowledgement; own acknowledgement was idempotent.

## Acceptance matrix and limits

| Case | Evidence and status |
| --- | --- |
| SF01 | Multiple file selection and Make primary exercised in real Dashboard UI; selection/order retained on failure. Saving deliberately refuses QA without a registered image adapter. Product/Service saved-photo/public-gallery operating acceptance remains OPEN. |
| SF02 | Projection/stale-photo CAS tests pass; pending/private/foreign exposure gates retained. Existing saved illustration was preserved after discarding unsaved QA files. Live approved-image/failure transport not exercised. |
| SF03 | Actual Storefront settings saved manual unavailable + book ahead, public detail showed Sold out now/request ahead; stock unaffected. Original flags restored. Zero/unknown/foreign boundaries covered by focused source/CAS checks. |
| SF04 | Actual product request **R-9C9M64**, one Small Crate, preferred **2 Dec 2026**, retained per-line preorder flag/date. Pending, no confirmed Order, no reservation/payment. Policy restored afterward. |
| SF05 | Actual Service settings off/on and both existing public Services inspected. No active request form exists; canonical temporary-form creation refused `POLICY_BLOCKED`. Read-only current policy reports `pending_evidence` for service staff/web, web/intake and web/booking. No approval fabricated; positive booking/capacity acceptance remains OPEN. |
| SF06 | Four exact Small Crates, ₦18,000; item link → public Eggs page → Back retained bag, name, note and Delivery. |
| SF07 | Actual registered local test OTP login resumed checkout. Identity and request scope tests reused. Real OTP provider delivery not tested. |
| SF08 | Optional initial address, delivery request, ask/reply destination and final fee verified. Published fulfilment configuration/server checks covered by focused tests. Actual OS geolocation permission flow not claimed. |
| SF09 | Durable request before canonical Order; replay/scope/contract checks and final same-Order replay pass. Stale price/policy source checks retained. No separate network-timeout UI fault injection. |
| SF10 | Dashboard bell/request deep link/read exercised; direct canonical foreign-scope refusal and idempotent personal read pass. |
| SF11 | Ask/reply, omitted/zero/negative/positive delivery charge and one canonical conversion verified; stock CAS/current configuration checks preserved. |
| SF12 | Customer opened exact reviewed quote/link in browser; cookie-less valid link passed. Tampered signature exposed no QA bank details. Live outbound messaging and every expiry/revocation combination not claimed. |
| SF13 | Actual local QA report Checking → canonical merchant verification → Paid/zero on all three surfaces; exactly one posting. |
| SF14 | Changed decision on confirmed report refused, unchanged money facts; existing allocation/evidence/privacy/short-link tests reused. No additional real-money partial/excess/rejection transactions created. |
| SF15 | Refresh/reopen and item navigation exercised; prior template pins preserved. Responsive viewport override was attempted but browser still reported width 1508, so no new mobile acceptance is claimed. Existing native scoped types and owning parity evidence are separate. |

## Implementation and validation

Own milestones: `e614a62a4` specification, `a89d89937` backend/contracts/migrations,
`7f5d3020c` Opus UI and integration, `4404ae6a0` local test OTP launcher passthrough.
Acceptance follow-up keeps preorder/date context in canonical Order notes without
inventing a delivery timestamp and scopes empty Activity alert copy so it does not
contradict website/payment notifications.

- Normal local QA migrations, db:push and client generation passed.
- Contracts/projection/listing/service intake/timezone: 34 tests / 217 assertions.
- Templates/navigation: 17 / 114; intent/draft: 2 / 10.
- Existing-Jawdah policy SQL CAS: 1 / 8; stale image snapshot: 1 / 2.
- Full Dashboard strict, production template TS+TSX graph and scoped native photo
  types passed. A broader unrelated promotion test fixture type error and the
  earlier full API default-memory exhaustion are not represented as passes.
- Follow-up owned two-path source smoke: **203 tests / 1,112 assertions**; current
  scoped DB strict graph passed. Concurrent extraction paths were excluded from
  ownership, though shared smoke imports their current code.
- Existing money allocation/evidence/presentation/privacy/short-link checks:
  **20 tests / 194 assertions** pass across six files.
- H01 current snapshot and H02 impact checks pass after the evidence update.
- Canonical existing-data `qa:smoke` passed at `4404ae6a0`, local web runtime
  unverified as expected. It created no sale/payment/fixtures. The separate
  owner-authorized feature journey above made the stated local QA requests.
- Other chat's Next 16.4.3 four-app production builds/types passed; later source
  extraction is separately owned. None of this is a Production release receipt.

Private screenshots, before/after facts and command logs are under
`.scratch/jawdah-storefront/2026-10-28/`; no capability URLs, OTPs or logs are
committed. Brain feature/task/API/database/ADR records are maintained locally.

Shared renderer fixes reach deployed sites after code rollout. New template
versions/defaults do not silently replace saved site pins or merchant settings;
site upgrade/publication remains explicit. No rollout was performed here.

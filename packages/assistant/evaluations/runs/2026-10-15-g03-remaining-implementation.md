# G03 remaining implementation requirements — 15 October 2026

Status: read-only source audit preserved as requirement evidence. This record does
not complete G03 or any acceptance milestone, authorize implementation effects,
activate a capability, or narrow G03 to the reads and decisions already present.
The full goal remains 45 tickets with 13 accepted (28.9%). Root owns the numbered
phase checklist, shared integration and Brain reconciliation.

## Intended final state and current boundary

G03 is the full request → versioned Quote → booking → pickup/delivery lifecycle,
preserving capacity, commercial approval and vertical permissions. The canonical
requirement is `.brain/plans/2026-10-09-assistant-business-operations.md:643–646`:
inventory all canonical request/quote/version/booking/pickup/delivery commands,
ship small lifecycle-ordered adapters, preserve quote-release approval/capacity/
handoff, and prove a second service vertical without bypassing prescription
permissions. ADR-0029 and ADR-0032 retain the platform and release boundaries.

Current GENERAL support covers quotation approval/rejection, their protected
reviews, and one exact saved-booking read. The inspected capability inventory
still lists 27 native G03 procedures as planned; two original quotation reads
already have pure assistant-specific replacements. Inventory `supported`
classification means source coverage, not active rollout or accepted behavior.
Existing native commands, planned wrappers and form-only surfaces are not
interchangeable with completed assistant functionality.

## Numbered gaps and next canonical seams

### 1. Request discovery, originals and staff intake

**Classification:** existing business commands; missing assistant integration,
with one disposition-command hardening prerequisite.

Canonical procedures include `serviceAccess.requests`, `requestForms`,
`createRequestForm`, `updateRequest`, `serviceCommerce.sourceProjection`,
`createInquiry`, `transitionInquiry` and `submitStaffIntake`.

The current request list is capped at 200, has no cursor/full count, and returns
customer text/contact fields. `sourceProjection` returns readiness/state, not an
exact operational detail with source lines and revision. Add bounded protected
discovery and an exact nonclinical source reader before resolving requests in
chat. Keep `ServiceRequest`, `CommerceInquiry` and `PrescriptionRequest` distinct;
do not create a universal aggregate or relabel Product inquiry as Service work.

Add strict source targets, exact original native views, explicit consent/contact
handling and reviewed request/intake actions. Staff Service intake can reuse the
repository's authenticated `formId` branch; do not require the model or merchant
to supply a public form token. Exact-product demand remains the cart/Order flow.

`updateServiceRequestDisposition` currently accepts only tenant/request/status/
response, performs an unguarded update, and lacks actor/current-Store authority,
expected revision and replay identity. Extract a current-authority,
revision-bound transaction command before wrapping it. Inquiry transitions
already enforce authority/state/audit, but need caller-owned composition and
GENERAL replay. Neither wrapper should rerun a previously accepted command to
reconstruct a receipt after an uncertain response.

Principal sources:

- `apps/api/src/trpc/routers/service-access.ts:111–233`
- `apps/api/src/trpc/routers/service-commerce/intake.ts`
- `apps/api/src/trpc/routers/service-commerce/inquiries.ts`
- `packages/db/src/queries/service-public.ts:202,362,576`
- `packages/db/src/queries/service-commerce-intake.ts:168`
- `packages/db/src/queries/commerce-inquiries.ts:484`
- `packages/db/src/queries/service-commerce-sources.ts:210`

### 2. Prepare and revise immutable versioned Quotes

**Classification:** existing business commands; missing transaction-local seam,
assistant actions and fully editable native UI.

`serviceAccess.issueQuote` and `serviceCommerce.issueInquiryQuote` reach
`issueCommerceQuote`. Existing commands support immutable new versions,
mutually exclusive Offer Options, exact quantities/minor amounts and
source-specific validation.

Add caller-owned pure preparation/review and commit seams, then strict GENERAL
issue/revise actions. Bind source revision, original current Quote/version,
Store currency, exact per-option lines/prices/availability evidence, fees,
promises and expiry. The server owns Quote/version/option operation identities.
Never add option totals or treat historical alternative lines as payable.

Preserve canonical author Terms, configured text screening, active attendant
assignment, release-policy revision, maker/checker and private `DRAFT` approval
behavior. A revision must not silently release a Quote or float an approval to
another version. Customer selection/acceptance remains customer authority:
public token-based commands cannot be called by the merchant assistant as
customer impersonation. Issued, customer accepted, Order created and paid are
separate outcomes.

Issuance currently screens text and opens its own root transaction. Calling it
from GENERAL's existing transaction would not atomically complete the proposal.
Extract preparation and transaction-local execution while preserving native
wrappers. Never cast a transaction client into a root client or permit a nested
independent commit. Keep release-owned source transitions, conversation action
messages, capabilities and notification intents atomic; enqueue only after
commit and retain durable recovery.

Principal sources:

- `packages/db/src/queries/commerce-quotes.ts:1119`
- `packages/db/src/queries/service-public.ts:621`
- `packages/db/src/queries/commerce-inquiries.ts:608`
- `apps/api/src/schemas/services.ts:392`
- `apps/api/src/schemas/service-commerce-inquiries.ts`
- `.brain/decisions/ADR-0032-store-team-routing-and-quote-release-approval.md:46`
- `apps/api/src/assistant/general-quote-decision.ts` (existing integration pattern)
- `apps/api/src/assistant/general-actions.ts:138` (caller-owned contract)

### 3. Booking availability, hold, confirmation and all lifecycle operations

**Classification:** existing core business commands; missing protected pure
availability/review seam and assistant/native operational workflow.

Existing commands are `holdBookingSlot`, `confirmBooking`, and `reviseBooking`
with all six operations: `arrive`, `start`, `complete`, `mark_no_show`,
`reschedule`, `cancel`. GENERAL exposes only `readBooking`, requiring an
already-known original booking/source/offering tuple.

Only public capability-based `publicBookingSlots` exists. Add authenticated,
pure bounded staff slot/review projection reusing canonical capacity evaluation.
Do not mint a customer capability merely to read availability. Return exact
source/offering/resource, current configuration revision, server time, saved
Store timezone and eligible slots. Resource capacity is not remaining capacity;
the exact saved-booking reader explicitly does not assess availability.

Extract caller-owned hold/confirm/revise seams. Preserve Serializable
transactions (10s max wait/30s timeout), resource/booking/financial-Order locks,
hold expiry, configuration and revision checks, exact source/Quote/Order/Job
links, idempotency hashes and operation identifiers. Native hold/confirm/revise
return customer access tokens; assistant receipts must exclude them. Notification
dispatch stays post-commit with canonical deduplication and recovery.

Native UI needs exact request/resource selection, explicit slot/timezone review,
separate hold and confirmation, all six lifecycle editors, exact original event
receipts and uncertain-attempt retention. Cancellation consequence is not a
provider refund. Stored `AUTHORIZED`, required deposit, current Order `PAID`,
and provider settlement remain separate facts. Complete/start cannot bypass
work authorization, readiness or commercial balance rules. Preserve exact ISO
instants/offsets, saved IANA timezone and DST semantics; do not guess local time.

Principal sources:

- `apps/api/src/trpc/routers/service-commerce/bookings.ts:218`
- `apps/api/src/schemas/service-commerce-bookings.ts`
- `packages/db/src/queries/service-commerce-bookings/lifecycle.ts:963,1207,1537,2007`
- `packages/db/src/queries/service-commerce-bookings/shared.ts:24,84,225`
- `packages/service-commerce/src/bookings.ts`
- `packages/db/src/queries/service-booking-read.ts`
- `apps/api/src/assistant/general-booking-read.ts`
- `apps/dashboard/src/components/service-commerce/booking/booking-workspace.tsx`

### 4. Capacity and booking configuration

**Classification:** existing business commands; missing assistant/native
coverage, with an explicit G05 dependency.

`bookingConfiguration`, `createBookingResource` and `updateBookingConfiguration`
already implement resources, availability, exceptions, lead time, horizon,
duration, cancellation/payment policy and reminders. Their inventory owner is
G05; they remain necessary dependencies for G03's final workflow.

Add protected configuration reads, reviewed strict actions and native editors.
Current update also changes shared resource names/capacities, Store settings,
rules and exceptions. Review must disclose and bind shared effects rather than
presenting the action as affecting only one appointment. Policy revisions stay
server-owned; confirmation snapshots remain immutable. Owner/Admin resource and
configuration authority is checked in the repository even where the route's
ServiceManager ceiling is broader.

Principal sources:

- `packages/db/src/queries/service-commerce-bookings/settings.ts:192,205,309`
- `packages/service-commerce/src/schemas/booking.ts`
- `apps/api/src/trpc/routers/service-commerce/bookings.ts`
- `apps/dashboard/src/components/service-commerce/booking/booking-workspace-state.ts`

### 5. Generic pickup and delivery

**Classification:** a genuine missing business-command implementation, followed
by missing assistant/native integration.

`fulfillmentDetail` can project accepted Service/Inquiry Orders. Shared
contracts define pickup preparation/handoff/exceptions and delivery
preparation/assignment/transitions. Both native mutation routes, however,
unconditionally call `createPrescriptionServiceCommerceFulfillmentAdapter`.
Its source check explicitly refuses `service` and `commerce_inquiry`. There is
no generic mutation adapter behind these routes. Existing Service Job handoff
does not implement courier pickup/delivery lifecycle.

Implement the non-prescription adapter and durable state/event/replay ownership
first. Reuse exact accepted Quote/source/Order checks, active Store attendant
authority, payment/readiness/preparation gates and financial lock order. Require
secure pickup proof, delivery proof for completion and structured failure,
reschedule and return reasons. Then add pure review/original reads, strict
GENERAL actions and native editors. Retain pharmacy professional release and
launch gates in its separate adapter; never route generic work through it.

Principal sources:

- `apps/api/src/trpc/routers/service-commerce/fulfillment.ts:50`
- `packages/db/src/queries/service-commerce-prescription-fulfillment-adapter.ts:25`
- `packages/db/src/queries/service-commerce-fulfillment.ts:253,468,507`
- `packages/service-commerce/src/schemas/fulfillment.ts:106`
- `packages/db/src/queries/prescription-fulfillment.ts` (compatibility authority)

### 6. Progressive Catalog, customer access and vertical completion

**Classification:** remaining wrappers/UI and end-to-end evidence, with explicit
G05/B02/privacy/channel ownership dependencies.

G03 also owns planned wrappers for `catalogMatches`, `createCatalogDraft`,
`linkCatalogOffering`, `attestCatalogAvailability`, `catalogGraduationReadiness`,
`graduateCatalogOffering`, `publishCatalogOffering`, plus Service request link
and tracking creation/revocation. Reuse existing commands. Preserve verified
source fingerprints, private drafts, exact inventory/availability evidence and
separate Owner/Admin graduation/publication authority. A request or Quote never
manufactures stock, reusable prices or publication. Price promotion remains
B02-owned rather than silently being absorbed by G03.

Customer actions/capability issuance overlap G05. Channel credentials, private
media viewing and policy administration remain intentionally human-owned
surfaces. Their `form_only` labels are not completed assistant functionality.
Tokens, signed URLs, private media and provider payloads stay outside
model-visible contracts. New assistant procedure admission must be explicit in
the scoped-procedure map; unknown procedures fail closed. Role ceilings cannot
replace fresh canonical team, Store grant, source and vertical checks.

The approved second vertical is appointments, not the separate bag-seller seam.
Historical native appointment evidence does not prove GENERAL signed lifecycle,
native app editing, saved-chat recovery or concurrent assistant confirmations.
New inert tests should cover authority, replay mismatch, stale revisions,
immutable version/option links, competing capacity, timezone/DST, callback
invalidation, exact originals and notification intent recovery. Connected,
provider and device evidence requires existing approval/scheduling gates.

Principal sources:

- `packages/assistant/src/capabilities/inventory.ts:243`
- `packages/assistant/src/capabilities/COVERAGE.md:691–780`
- `packages/assistant/src/capabilities/manifest.ts:263–401`
- `packages/assistant/src/general/contracts.ts:468`
- `apps/api/src/assistant/general-tools.ts:1760`
- `apps/api/src/utils/staff-procedure-policy.ts`
- `apps/api/src/assistant/general-context.ts:330`
- `apps/api/src/trpc/routers/service-commerce/catalog.ts:94`
- `packages/db/src/queries/service-commerce-catalog.ts`
- `packages/db/src/queries/service-commerce-graduation.ts`
- `.brain/features/service-commerce.md:598`
- `.scratch/service-commerce/issues/07-add-booking-and-appointment-lifecycle.md`

## Bounded recommended next implementation

Start with bounded nonclinical Request/Inquiry discovery and exact source/
original reader, then the hardened disposition transaction seam. This provides
authoritative identity and revision for later Quote and booking work without
inventing IDs or changing the final scope. Separate subsequent packets should
cover issuance, staff capacity review and booking commands, generic fulfilment,
and remaining Catalog/access wrappers. Every write packet needs shared strict
contracts, canonical transaction composition, fresh review, signed proposal,
explicit human confirmation, durable exact receipt/replay, native edit/original
surfaces and inert regression evidence. Source delivery earns no acceptance
milestone by itself.

## Preserved execution gates and evidence limits

- G01 connected QA remains human-paused; preparing source is not permission to
  resume it.
- Paystack/provider work remains paused and separately authorized.
- D04's 12 conditional cases remain UNSCHEDULED with its existing fingerprint
  prerequisites. Historical failures are not bypassed.
- E05 runtime activation/restart rejection remains in force.
- G04's six deferred connected sections remain UNSCHEDULED.
- S05's seven acceptance cases remain UNRUN after budget refusal; the 207ms
  diagnostic is historical observation, not permission or retry scheduling.
- C04 target/approval boundaries remain unchanged.
- No schema/client generation, migrations, database query/write, model/provider,
  runtime activation/restart, device/browser, staging, commit, push or deployment
  was performed for this audit. No test suite ran. Read-only source inspection,
  path verification and SHA256 capture are the evidence.
- Agent Chat initially refused its read with invalid shared metadata; root was
  notified. A later read while preserving this record returned no unread
  messages. The child did not repair or append shared metadata.
- Brain impact belongs to root's goal/checklist reconciliation. This child
  changes only this new evaluation record, not product or Brain source.

## Principal inspected source hashes

SHA256 captured from the shared working tree when this record was created.
These are audit provenance, not a source freeze or approval for execution.
Root's concurrent G05 integration may change shared modules; re-review changed
dependencies rather than applying this snapshot as a stale patch.

| Repository path | SHA256 |
| --- | --- |
| `.brain/plans/2026-10-09-assistant-business-operations.md` | `1528491e40b66f4490db14bbe23c8f4eda2dc5158eeff006c565a4668d600ef6` |
| `.brain/features/service-commerce.md` | `77f2a1c8ce5e7b95c04242415275bf07e825d8a188bfe4288d7c4b30ed82334b` |
| `.brain/decisions/ADR-0032-store-team-routing-and-quote-release-approval.md` | `eb7f2716eca38098b56330ec0c0c8a2db2be89abcd605960b55839b1ea624eea` |
| `packages/assistant/src/capabilities/inventory.ts` | `278282b6572f321da49a67b188b38304fcae1b171a2e5fc025a58ecaabaeca85` |
| `packages/assistant/src/capabilities/manifest.ts` | `d12c6d1330f9f44be45d1f17699765fd26e5464ea9e3c7f410c241ab1dba74a6` |
| `packages/assistant/src/general/contracts.ts` | `267fef28a44cb4cb078e4d9d36339ed6b8ed8914d2883630b2dcd233eb393a56` |
| `apps/api/src/assistant/general-actions.ts` | `94ad7ac1c38ae20cc0f50c66567f12717caecf92c891b4d39cd0a59572c08df4` |
| `apps/api/src/assistant/general-tools.ts` | `0ceaff2bb8413726a5cdac2a504b55af101a03fadf957607bb046035bce3c912` |
| `apps/api/src/trpc/routers/service-access.ts` | `070f9027dfe3e3f04580d183aab8d757962a54c1f2450bb813738415c0cfae48` |
| `apps/api/src/trpc/routers/service-commerce/bookings.ts` | `93ee065b3a64484a1c564979610b544d6356ddad3d98dc06d37bf2e71c7d3206` |
| `apps/api/src/trpc/routers/service-commerce/fulfillment.ts` | `cb696b1b9d4aad6c039057610b50e894abbb005a51ff29b916266e7dc228ac7b` |
| `packages/db/src/queries/service-public.ts` | `ce418de649ee0360d2447fb2ca170dda9d3df86d01dfc5cc279758f82c554c3d` |
| `packages/db/src/queries/commerce-inquiries.ts` | `99d6ea332b058740bc6851678cd2ca8a95e84f2b3f69c0fa38bfd49242970fe6` |
| `packages/db/src/queries/commerce-quotes.ts` | `f540a2f8eba77f444a71abb23d957b048a44a3dfeb64d02490b917ec31bdc1cf` |
| `packages/db/src/queries/service-commerce-intake.ts` | `41da3788dc37289a1c42ec9f848994607e83025d37f4aa48e2e8a20c18111ae3` |
| `packages/db/src/queries/service-commerce-sources.ts` | `b8d78511f7c074febdb9de7f25ead7158ede9d61684ecbbbd82cc0584151e82f` |
| `packages/db/src/queries/service-commerce-bookings/lifecycle.ts` | `60bb36d284ac6f03742a5541a6b9dfa1e30f1b4fc8095c54d4b77180b2e002bb` |
| `packages/db/src/queries/service-commerce-bookings/settings.ts` | `80f538f5226900b8304e8c8fd31f4872e33341f59ab6d8193a63364195c77e89` |
| `packages/db/src/queries/service-commerce-bookings/shared.ts` | `66a87680b1bbcefe1a0fdc69ed16f42d623d24ffbfb0902ca879c0077c4ab8b0` |
| `packages/db/src/queries/service-commerce-prescription-fulfillment-adapter.ts` | `d086011ea4866582484763e47230dba29f2641d1e695cf3cab197f01cddc537a` |
| `packages/db/src/queries/service-commerce-fulfillment.ts` | `9f1e21fb36cc7bef5493e71605109b4eb98c120de18ae9ada83407955b17936b` |
| `packages/service-commerce/src/schemas/fulfillment.ts` | `4d8c65709ede08a80d15501539599535dabe0e545c7c3a0f5294507058cd8ddc` |


## Later implementation checkpoint — 15 October2026

Schema-free ServiceRequest discovery/exactoriginal backend+model source is now
implemented, protected and independently reviewed. See current g03-request-read-
source report and Brain feature for exact checks/hashes. This does not check the
full group1 requirement: Inquiry/staff-intake/native views and durable disposition
still remain. All other numbered groups/full G03 acceptance remain open. No
mutable-status replay substitute or schema/provider/runtime action.

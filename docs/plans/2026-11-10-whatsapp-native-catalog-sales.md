# T10 — Fully native WhatsApp catalog sales

10 November 2026. **v17 selected; product implementation authorized and in progress.**
The owner explicitly replied “Select v17 and authorize T10 product implementation”.
Exact revision: `d329aac5-7648-450c-a4bd-4218b4a1b36b`. No release/provider action is
authorized. The original planning record follows. Owner chose “Plan fully
native WhatsApp sales” during the five-phase takeover. This adds a Phase 3 ticket
for R23 (H23/A23), with R24 reconciliation coverage; it does not relax either case
or change the 72-case denominator. An app-review handoff does not satisfy R23.

The requested result is a counter sale completed inside WhatsApp: identify exact
saved products/options/units, collect customer and payment facts, show the entire
review, Edit/Cancel/Confirm, then one durable Order receipt. The same canonical
Order, stock and payment records must appear in dashboard/mobile.

## Original source audit and the missing pieces

Source reviewed at `4666bc03f` (plus the unchanged preceding source):

- `packages/assistant/src/capabilities/manifest.ts`: `sales.order.create` uses
  `order_create`, includes WhatsApp, but its WhatsApp mode is `app_review`.
  `sales.order.record_simple` is native `sale_record`, a money-first quick sale;
  it cannot substitute for a catalog sale with offering/stock identity.
- `apps/api/src/assistant/general-actions.ts`: `orderCreate` already prepares,
  validates, reviews and executes the catalog Order. Exact offering, quantity,
  configuration version and fixed-price/entered-total checks exist. Initial
  payment is composed through canonical `createCommercialOrderInTransaction`;
  its payment command ID is derived from the same stable Order idempotency key.
- `packages/assistant/src/general/contracts.ts`: `order_create` supports up to
  30 lines, `fulfillNow`, customer and an optional explicit positive initial
  payment. Preserve these canonical types instead of adding WhatsApp sale types.
- `apps/api/src/assistant/channel-proposal-review.ts`: the native complete-facts
  verifier has no `order_create` case and defaults to refusal. Merely changing
  the manifest therefore cannot safely enable native catalog sales.
- `packages/assistant/src/channels/action-review.ts`: a complete native review
  has a 3,000-unit maximum and a 500-unit instruction reserve. Facts must not be
  clipped to fit. Large Orders need a deliberately designed bounded native review.
- `packages/assistant/src/channels/policy.ts`: newer native reviews require the
  exact `ASSISTANT_WHATSAPP_NATIVE_REVIEW_ACTIONS` release entry. `order_create`
  is not yet in that staged action list.
- Catalog Order creation permits broader sales roles than `payment_record`.
  The current `orderCreate` adapter checks `payment_record` at prepare/review/
  validate/execute for initial payments. Native cashier unpaid vs. paid admission
  must be resolved explicitly; no blanket Finance or standalone-payment grant.

No missing Order/stock/payment ledger is inferred. This is channel review,
collection, bounded authority and release integration over the existing domains.

## Required conversation

1. Resolve the linked active actor, business and Store before ordinary model input.
   Use current saved choices/prices; grouped questions ask only unresolved facts.
   “Two black XL jalabiyas” must select an exact saved offering/unit. Ambiguous
   sizes, brands, units, unavailable items and missing prices require clarification;
   never guess combinations, silently substitute a productless sale or invent stock.
2. Keep one resumable canonical `order_create` draft through corrections. Identify
   a saved customer only after an exact/confirmed selection; otherwise explicitly
   agree Walk-in. Source follow-through found that the canonical Order command
   calls `ensureOrderCustomerInTransaction` for a supplied name/contact and can
   create or link a business-wide directory Customer. Do not describe that path
   as snapshot-only. The initial native slice uses a confirmed saved `customerId`
   or explicit Walk-in with no free-text customer identity fields. A new Customer
   needs its separate permitted review/confirmation before resuming this sale;
   a refusal leaves the sale draft unsaved and its known facts intact.
3. Collect unpaid / part paid / fully paid, the stated amount and payment method.
   For money already received, resolve an eligible existing receiving account using
   the canonical tenant/currency read. Ask when ambiguous; show any valid canonical
   single-account suggestion. Do not create a Finance Book/account implicitly.
4. Show exact item + option + selling unit, quantity, line price and total;
   customer, total, received, balance and receiving account; and the exact stock
   consequence. “Handed over now” uses canonical `fulfillNow`; otherwise use the
   app's existing outstanding/reservation behavior: on-hand stays unchanged,
   reserved increases and available decreases. Do not promise stock deduction
   for an unfulfilled Order. Recording received money initiates no provider charge.
5. Edit rotates the proposal revision and invalidates every previous Confirm.
   Cancel writes no Order/stock/payment. Confirmation comes only from the current
   deterministic, quoted action control or its supported exact typed fallback;
   bare “yes”, a model decision or a form submission cannot save the sale.
6. Confirm revalidates current authority, scope, entitlements, exact prices/unit
   configuration, stock and account/Book eligibility inside the canonical locked
   transaction. A change refuses the old review and returns an editable fresh draft.
7. Return the same saved Order reference, exact total/received/balance and a scoped
   record link under retry. An Open link is useful after saving; opening the app
   cannot be required to complete a supported native sale. Customer sending and
   subsequent payments/returns remain their existing separate reviewed actions.

## Native review size and identity

Support the existing contract's 1–30 sale lines without silently splitting one
sale into multiple Orders. A complete review that fits the current envelope uses
one native review. Longer material facts need deterministic native pages tied to
one immutable proposal ID/revision/payload hash, not a model-written summary.
Show page count and progress, retain all exact line facts, and expose Confirm only
on the final summary after the complete current review was delivered/viewed through
the supported controls. Reopen/Next/Previous is read-only and cannot create a sale.

Before implementing this, inspect the existing durable action proof/outbox model
for a suitable review-page delivery binding. Reuse it if it can represent every
required fact; otherwise propose the minimum schema extension and its migration
before editing schema. A single-message proof must never authorize undisplayed
pages. Old-version page controls expire with Edit, scope/authority change or expiry.
Transport failure after save recovers the existing receipt; failure while delivering
review pages never grants an early Confirm. Payloads beyond canonical limits remain
explicitly unsupported; they do not pass R23. The legacy app fallback remains safe
for unsupported shapes while the new native review is under construction.

## Permission decision to implement and review

Keep the canonical role/Store rules. Owner/Admin/eligible Manager sales and payments
use current authority. An assigned Cashier/Operator may only perform the sale work
allowed by the equivalent app/canonical Order command at that Store. Revoked,
suspended, foreign-Store and unsupported roles refuse before effects.

For an initial payment that the canonical Order command already permits but the
standalone assistant `payment_record` capability does not, add a **narrow reviewed
initial-payment authorization seam owned by `order_create`**. Bind it to the same
Order payload, stated positive amount/method, eligible existing account and one
idempotency key. Test it through the real linked-channel principal and canonical
transaction. Do not clone/elevate the principal, reuse the simple-sale bootstrap
exception, broaden `payment_record` roles, enable Finance administration or allow
later unrelated payment commands. If parity cannot be established, retain refusal
and an explicit open acceptance item; do not claim native cashier payment support.

## Implementation slices and ownership

| Slice | Existing files / work | Done when |
| --- | --- | --- |
| T10.1 Review the conversation | Existing `assistant/conversations` library, approved T5–T7 context and current implemented sale scenes; retain old `whatsapp-system` history | Immutable revision covers exact sale, missing/ambiguous choice, edit/cancel, all payment states, handover, paged review, stale/scope/retry/receipt; owner selects the exact revision before product changes |
| T10.2 Canonical draft + admission | `general-actions.ts`, `general-context.ts`, `general-proposals.ts`, `general/contracts.ts`, existing order-preparation tools | Missing facts remain one draft; current initial-payment/role parity is independently proved without broadening standalone permissions |
| T10.3 Native review + proof | `channel-proposal-review.ts`, `channels/action-review.ts`, `channel-action-turn.ts`, existing durable channel proof/outbox repositories | Complete exact review, bounded page/confirmation binding, deterministic Edit/Cancel and stale-action refusal; no generic completeness bypass |
| T10.4 Declare source support | `capabilities/manifest.ts`, `channels/policy.ts`, exact handoff/policy tests, generated `COVERAGE.md`, H02 record | Only `order_create` gains staged native source support; all unrelated gates/classifications remain; target release entry stays unset |
| T10.5 Prove records + recovery | Existing channel confirmation fixture and canonical Order/stock/payment suites; add one focused catalog-sale integration suite | One Order and the expected canonical stock/payment/history changes; exact replay/concurrency/refusal/cleanup evidence |
| T10.6 Operating acceptance | T9 register H23/A23, R24 dependencies and exact design/source/target receipt | Authorized nonproduction native journey passes with merchant-approved data; hosted/provider proof only after its separate approval |

The established Workshop default author remains Claude Opus 5.5/high; if unavailable,
the coordinating Codex agent takes over under the standing fallback. This plan
creates no author session and publishes no design/Site. The current owner-directed
conversations review surface, local-only mirror exceptions and older immutable case
history must be reconciled from the existing feature record before authoring;
never replace the surrounding design or silently republish a private Site.

## Focused acceptance checklist

- [ ] Unpaid exact-choice sale: one Order, correct full balance and canonical
  fulfilled/unfulfilled stock consequence; no payment or journal invented.
- [ ] Partial and full payment: stated amount, eligible receiving account, exact
  remaining balance and expected canonical money/history, atomically with Order.
- [ ] Saved customer, explicitly agreed Walk-in and ambiguous/new contact follow
  current customer permissions; no silent customer merge or identity creation.
- [ ] Exact variant/unit/price, leading-zero code where supplied, fractional
  quantity at allowed precision; unknown/ambiguous/unavailable/changed price/stock
  cannot confirm stale or invented facts.
- [ ] Complete single-page and maximum-contract paged review: no clipped line,
  skipped-page approval, stale page control or amount substitution.
- [ ] Edit, Cancel, expiry, scope switch and revoked member refuse old controls
  with no Order/stock/payment; current fresh review succeeds.
- [ ] Two confirmations, webhook retry, transaction race and post-commit outbox
  failure yield one canonical Order/effect set and the same recoverable receipt.
- [ ] Cashier/Operator allowed operation plus privileged/foreign-Store refusals;
  no new standalone payment/Finance/account-creation access.
- [ ] Refetch exact original Order in dashboard/mobile and reconcile inventory,
  amounts, receipt/history and original actor; transport success alone is no pass.
- [ ] Exact selected design, source commit, focused checks, actual environment,
  human approval and target release recorded independently; H23/A23 remain blocked
  until this evidence exists.

Reuse existing simple-sale/review/permission/idempotency proof where unchanged;
exercise the new catalog/stock/initial-payment/page-binding seams directly. Follow
`docs/testing.md`: offline doctor, owned-path quick plan/check, actual H01/H02,
relevant types and narrow pure tests. Integration tests require their guarded
nonproduction data window and cleanup; ordinary `qa:smoke` creates no business
fixture or sale/payment. Do not run connected tests or send WhatsApp messages merely
to validate this planning document. No estimate or rollout date is asserted.

## T10.1 review revision — 10 November 2026

Continued the existing implemented **01 Library**, preserving its shared kit,
every baseline scene, the selected v14 `ce2df6f7-63ff-4e87-a573-3fda97f00f08`
and all three previous implementation receipts. The current review candidate is
**v17 `d329aac5-7648-450c-a4bd-4218b4a1b36b`**, unselected and unimplemented:
[exact revision](https://workshop.localhost/ewatrade/assistant/conversations/directions/01?rev=d329aac5-7648-450c-a4bd-4218b4a1b36b).
Earlier v15/v16 authoring checkpoints remain immutable history. No private Site
was republished. Codex authored under the standing fallback after the exact
Claude Opus 5.5/high probe failed authentication; no other Claude model was used.

The extension adds **13 proposed cases / 122 states** to the existing collection.
These are synthetic design replays, not merchant fixtures, captured product
output, native transaction proof or a new runtime state machine. Config controls
can inspect any state; that inspection is not a runtime approval path.

| Case | Exact review concern |
| --- | --- |
| `w-catalog-sale` (v2) | Saved item/option/unit and confirmed customer; explicit full-payment statement |
| `w-catalog-sale-payment` | Unpaid, partial, full; method and eligible existing receiving account |
| `w-catalog-sale-handover` | Handed-over stock deduction versus deferred reservation |
| `w-catalog-sale-edit` | Same draft; changed quantity retains stated received money; old Confirm refused |
| `w-catalog-sale-pages` | All 30 exact lines on six item pages and one full summary; one Order |
| `w-catalog-sale-page-retry` | Missing-page retry and old-page refusal; no early Confirm |
| `w-catalog-sale-stale` | Price, stock and selling-unit changes require fresh review |
| `w-catalog-sale-access` (v2) | Store/access/expiry changes and bare-yes refusal |
| `w-catalog-sale-recovery` | Duplicate Confirm, pre/post-commit failure and original receipt recovery |
| `w-catalog-sale-cashier` | Proposed same-sale initial payment; no standalone payment or Finance grant |
| `w-catalog-sale-customer` (v2) | Explicit Walk-in or separate named Customer review before sale |
| `w-catalog-sale-unit` | Exact leading-zero code and allowed fractional unit precision |
| `w-catalog-sale-unavailable` | Unknown/unsaved option, missing price, overpayment, ineligible account and >30 lines |

The source proof audit confirms `AssistantWhatsAppActionReview.reviewOutboxId`
and `reviewDigest` bind one accepted sent review. The consume path checks its
exact content digest, quoted provider message, accepted delivery attempt, current
principal generations, proposal revision and expiry. Read-answer pagination is
read authority; it does not prove a complete write review. T10.3 must propose the
minimum durable page-set representation before any schema change: immutable
page count/order/digests bound to the proposal/revision/hash, each accepted send,
and current bound Next acknowledgments. Reopen/Previous are read-only; Edit,
expiry or changed authority invalidates the whole set. The final summary cannot
issue approval before all current required pages are delivered and acknowledged.
No schema design is claimed as implemented or preapproved by this document.

T10.1's remaining gate is owner selection of this exact revision **and** explicit
authorization to implement T10.2–T10.5. T10.6 still requires the separate guarded
acceptance window, merchant data and target approval. H23/A23/R24 stay blocked;
the 72-case denominator is unchanged. Focused check and rendered-review evidence:
[Phase 3 receipt](../verification/2026-11-10-business-phase-3.md).

## Original plan validation

Source paths, local links and the two R23 register associations were checked.
All 72 case IDs/statuses and the 6/1/47/18 scorecard remain unchanged. Scoped
documentation quick checks pass **51 tests / 254 assertions**, QA-tooling types,
zero unknown mappings and whitespace checks; H02 reports no gated source change.
No application/runtime, database, model, provider or UI test was needed for this
planning-only addition. Earlier executed source/UI evidence remains in the
[five-phase takeover receipt](../verification/2026-11-10-five-phase-takeover.md).


## Authorized implementation checkpoint — 10 November 2026

Workshop selected the exact v17 revision before product edits. T10.2–T10.5 are
authorized; T10.6 operating acceptance stays separate. Source adds optional explicit
customer/payment choices to the existing Order draft, exact stock/payment facts and
read-only native pages using existing private proof JSON storage. No schema change.
Current `order_create` parent authority admits the bounded item/customer collector
and the same Order's initial payment; dashboard preparation's manager gate and
standalone customer/payment/Finance permissions remain intact.

Every intermediate page permits navigation/Edit/Cancel; only a fully acknowledged,
accepted-delivery chain reaches final Confirm. Confirmation rechecks current linked
authority, immutable proposal/source/stock/account facts and canonical Order rules.
Unsupported material text refuses intact rather than truncating or splitting orders.
The native write remains default-off under its exact native-review action setting;
hosted release additionally needs its exact released capability entry.

Implementation preserves the existing NGN1m equivalent minor-unit Order ceiling.
The design's synthetic NGN2.34m sample therefore exceeds current canonical support;
30-line source rendering uses a valid lower-total sample. Actual native pages are
sized dynamically around full Business/Store/revision/expiry/item/stock facts, so
their count can differ from the seven compact design pages. Neither difference
reduces complete review or silently changes canonical money limits.

Current source/checks/remaining operating gates are recorded in the
[native catalog-sale receipt](../verification/2026-11-10-whatsapp-native-catalog-sale.md).
Historical planning-only statements above describe the pre-authorization checkpoint.

### Guarded source checkpoint and remaining paid gate

The authorized T10.2–T10.5 source is implemented behind default-off release entries;
its paid/Cashier/replay acceptance is unfinished. Exact review/pageproof/authority/
receipt source checks and strict API/DB types pass. Actual isolated partial4line
confirmation still fails P2028 at30,751ms/30,000ms after bounded duplicate-read,
fresh same-transaction context and server-output composition reductions. Cleanup
passes with zero external calls. No further query-trimming/automaticretry/timeout
increase or Finance expansion is part of this source checkpoint. Coordinator owns
the policy/worker-budget review and next acceptance step. The selected exactv17
remains selected without a T10 implementation record until required proof succeeds.
Full history and limitations:../verification/2026-11-10-whatsapp-native-catalog-sale.md.
Accepted roadmap remains T10.1 only,1/6(16.7%); no merchant72case promotion.

# Pharmacy launch simplification

28 October 2026 · Planning only · Source audit baseline: `4aa915004`.

The owner requested a concrete keep/hide/defer plan, with **customers submitting
through EwaTrade's customer page and pharmacy staff handling requests inside the
merchant Assistant workspace**. Both sides are included. No implementation,
activation, provider operation, migration, publication or deployment is authorized
by this document. Existing unrelated checkout changes were left untouched.

## Recommended launch

Launch one approved pharmacy Store with a web-only, human-led prescription flow:

1. A Store link or QR opens the customer EwaTrade page, with **Send prescription**.
2. A private structured form collects prescription pages, consent, contact and
   pickup preference. Submission creates one canonical `PrescriptionRequest` and
   links it to the customer's Store conversation; it is not an Order yet.
3. Staff see **Prescription requests** in `/assistant`. A secure human-operated
   panel opens the existing clinical workflow, scoped to the current Store.
4. Authorized staff read the safety-cleared original and enter/verify medicine
   lines manually. A verified pharmacist approves the exact current revision,
   requests clarification, or declines it.
5. Only released, available lines become an itemized current Quote. The customer
   accepts it on the web and uses the existing approved payment flow.
6. Staff prepare the paid order; the customer returns to the secure page for
   status and pickup instructions. Existing pickup handoff completes the order.

The customer page may look conversational, but the first release uses structured
intake, clarification and lifecycle actions. It does not introduce an autonomous
clinical chatbot or relax current guest-message, age, Terms or access policies.
Existing guest free-form text is refused; a new form must not depend on first
sending a guest message. Customer registration must not become an unnecessary
intake prerequisite where the existing guest capability is permitted.

Use the existing Store entry, conversation and tokenized prescription routes as
one journey. Keep secure quote/payment/status pages as continuations, rather
than rebuilding their contents in the chat timeline. Keep `/prescriptions` as a
compatibility/direct-workspace route; make Assistant the primary staff entry.
Do not build a second prescription inbox, commerce engine or record store.

## WhatsApp decision

Checked 28 October 2026 against the official
[WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy), last
updated 23 September 2026. Sections 4–5 prohibit buying, selling, promoting or
facilitating exchange of prescription drugs. The listed OTC messaging exception
does not include Nigeria and does not permit regulated commerce experiences.
Business licences do not override these restrictions.

**Launch decision:** defer pharmacy prescription commerce over WhatsApp. Exclude
prescription intake/media, product selection, quote/payment links, purchase CTAs,
and prescription order notifications. Moving checkout to a website does not
establish permission to facilitate that purchase through WhatsApp. This is the
conservative product boundary selected for this launch, not a claim that every
unrelated administrative interaction by a pharmacy is prohibited.

Revisit only after current official policy permits the exact country/use case
and its provider/operating acceptance is established. An internally entered
approval reference, working WABA or approved template is insufficient by itself.
Leave ordinary non-pharmacy platform WhatsApp behavior outside this change.

## What already exists

These are source findings, not fresh runtime acceptance or claims about current
deployed settings. Prior local evidence is documented in the Brain feature; it
must be matched to the eventual candidate before reuse.

| Capability | Evidence inspected | Finding and implication |
| --- | --- | --- |
| Public prescription submission and continuation | [intake page](../../apps/storefront/src/app/prescription/[token]/page.tsx), [Store-entry redirect](../../apps/storefront/src/app/r/[token]/prescription/route.ts) | Private file form, consent/contact capture, request creation, safety-job enqueue and optional conversation attachment exist. The conversation attachment currently depends on conversation/message context; a reliable structured-first entry needs explicit wiring. |
| Private prescription storage | [providers](../../packages/prescriptions/src/providers.ts), [media transport](../../apps/api/src/prescriptions/media-delivery.ts) | Development in-memory storage and short-lived delivery exist. `getConfiguredPrivateMediaProvider()` throws in Production. Remote prescription upload therefore still needs a real production adapter and acceptance; configuration alone is insufficient. |
| Manual entry | [request repository](../../packages/db/src/queries/prescription-requests.ts), [router](../../apps/api/src/trpc/routers/prescriptions.ts), [staff form](../../apps/dashboard/src/components/prescriptions/prescription-intake-form.tsx) | `startManualPrescriptionTranscription` supports media-free staff intake, uses `manual-staff-entry`, and enters attendant verification. It rejects requests containing media. It cannot yet replace OCR for uploaded prescriptions. |
| Human verification and release | [request repository](../../packages/db/src/queries/prescription-requests.ts), [review workspace](../../apps/dashboard/src/components/prescriptions/prescription-request-workspace.tsx) | Every current line is verified before pharmacist review. Release binds current media/transcript revisions, pharmacist role, offering, quantity and inventory facts. Reuse these authorities. |
| Merchant Assistant | [Assistant shell](../../apps/dashboard/src/components/general-assistant/assistant-workbench.tsx), [capability inventory](../../packages/assistant/src/capabilities/inventory.ts) | Assistant is a merchant AI workspace. `prescriptions.*` is explicitly `formOnly`; a pharmacy inbox/panel is not already supported by assistant tools. Add a deterministic UI entry and reuse the human forms; do not expose clinical operations to the model. |
| Clinical data to shared commerce | [source adapter](../../packages/db/src/queries/service-commerce-prescription-source-action-adapter.ts), [payments](../../packages/db/src/queries/prescription-payments.ts) | The adapter checks current clinical release and Store activation; quotes/payments remain canonical. Generic Order or Service preparation must not bypass this source boundary. |
| Pickup and delivery | [fulfilment repository](../../packages/db/src/queries/prescription-fulfillment.ts), [fulfilment panel](../../apps/dashboard/src/components/prescriptions/prescription-fulfillment-panel.tsx) | Both exist; the panel currently queries both. A pickup-only launch needs delivery commands/entry points unavailable and delivery queries unmounted, not merely collapsed. |
| Pharmacy settings | [compliance workspace](../../apps/dashboard/src/components/compliance/pharmacy-compliance-workspace.tsx), [public channel](../../apps/dashboard/src/components/prescriptions/prescription-public-channel.tsx), [operations setup](../../apps/dashboard/src/components/prescriptions/prescription-operations-setup.tsx) | Setup combines clinical policy, public links, WhatsApp, delivery, retention and incident controls. The public-channel UI can construct a WhatsApp test link. Simplify composition and keep security controls available to their proper operators. |
| Channel and launch gates | [channel policy](../../packages/service-commerce/src/policy.ts), [platform gate](../../packages/db/src/queries/prescription-launch-gate.ts) | Nigeria pharmacy WhatsApp defaults to prohibited, though policy facts can represent an approval. Production prescription access requires consistent production markers and a separate approval switch. Preserve the gate and explicitly exclude deferred channels in the eventual rollout. |

There is no evidence from this review that the generic storefront contract alone
classifies every medicine for safe direct checkout. The pilot needs explicit
catalog review and an enforced purchase-path decision. Do not use a category
name, pharmacy profile, hidden button or assistant prompt as authorization.

## Keep / hide / defer

**Keep** means part of the proposed launch, reusing existing authority where
possible. **Hide** means remove from ordinary launch navigation or mount only
when relevant; this never substitutes for server authorization. **Defer** means
unsupported in the launch, with existing source/history retained.

| Area | Keep | Hide from the launch experience | Defer / server boundary |
| --- | --- | --- | --- |
| Customer entry | One Store web link/QR and structured Send prescription action | Web-versus-WhatsApp chooser and separate competing prescription entry menus | Prescription WhatsApp bridge and `wa.me` purchase/test links |
| Merchant work | One Store-scoped queue and existing clinical forms opened from Assistant | A second primary Prescriptions navigation destination; keep compatible deep links | LLM prescription tools, autonomous patient replies, clinical decisions or substitutions |
| Prescription reading | Safety-cleared originals, manual lines, explicit verification and revision history | OCR start/retry/confidence controls and transcription technical labels | OCR provider, jobs and automated extraction for pilot requests |
| Staffing | Verified pharmacist and attendant permissions, current membership checks | Branch/group routing setup and nonessential assignment controls | Multi-branch rollout and central-number routing. Do not merge professional roles; one person holding both requires the approved operating policy and existing role rules. |
| Catalog | Existing catalog/offering and exact stock facts; small curated pilot inventory | Bulk adoption, historical-price suggestions and catalog-graduation UI | Procure-to-order, unknown-stock selling and automatic medicine publication |
| Ordinary shopping | Existing cart for explicitly reviewed eligible non-prescription goods, including only OTC products approved for this flow | Direct Add to bag / Buy now for prescription or unclassified medicines | Prescription purchases use the pharmacist-reviewed request path; prevent generic cart/order/assistant bypasses at their owning server commands. Exclude unclassified products from direct shopping until reviewed. |
| Clinical decisions | Full availability or clear unavailability/decline, clarification and pharmacist release | Alternative-selection and partial-fill controls on the first happy path | Substitution and partial fulfilment as supported launch features; do not drop or silently alter requested lines to manufacture a full-fill order. Reuse existing exception states. |
| Quotes and payment | Immutable current quote, expiry, exact quantity/price, stock recheck, explicit acceptance, existing approved hosted payment | Multiple payment choices and advanced offer options | New gateway, clinical prepayment or unapproved manual-payment integration; payment failure and refund/cancellation handling remain required. |
| Fulfilment | Pickup, readiness, secure handoff and operational exception support | Delivery choice, zones, fees, assignment, tracking and delivery reports | Courier/delivery operations and cold-chain/controlled/restricted products outside the approved pilot scope |
| Communication | Secure web status, structured clarification/reupload and human-led replies where permitted | Prescription WhatsApp setup/templates/prompts and sharing buttons | Automated prescription WhatsApp messages, reminders and outbound clinical content; email/SMS/push are optional separate channels, not required for the return-to-web launch. |
| Administration | Minimum licensed-Store identity/policy, verified roles, hours, consent, pickup and activation readiness | Advanced reporting/metering, configurable commercial model and everyday retention sliders | New reporting, pricing experiments, Embedded Signup and self-service pharmacy onboarding |
| Safety and privacy | Private media, screening, scoped access, audit, approved retention/rights handling and stop controls | Patient detail from generic notifications/AI history; technical settings from ordinary staff | Automatic erasure until the existing category-aware approval/processor boundary is met. Existing incident, audit and rights operations stay accessible to authorized operators. |
| Clients | Customer responsive web and merchant Dashboard Assistant | Unverified native pharmacy entry points and marketing promises | Native pharmacy feature rollout; maintain compatibility and enforce the same scope server-side. No extra app shell or mandatory app download. |

Hiding applies to new work and launch navigation. Do not erase historical Quotes,
Orders, delivery records, settings, audit trails or compatibility links. If any
existing in-flight non-pilot work is discovered during rollout review, identify
its operator and preserve safe completion; a launch flag must not strand it.

## Smallest required changes

1. **Structured customer intake and continuity:** connect the customer Store page
   directly to canonical prescription intake without requiring a guest message;
   retain the correct request/conversation/source identity across retry, refresh,
   clarification, quote acceptance and return visits. Fix the currently hardcoded
   public consent-version submission to bind the approved current policy. Keep
   prescription uploads inside the clinical-media boundary.
2. **Manual review for uploaded originals:** add a narrow command for manual
   transcription against the current safe media revision. Reuse transcription
   lines/history, verification and pharmacist release; label provenance as human
   entry. Refuse unsafe/pending media and stale revisions. Do not invoke the
   media-free staff helper on an uploaded request or fake a successful OCR job.
   Keep the valid staff-only path. Make request creation/manual initialization
   replay-safe: the current router runs them separately and only initializes
   when `created` is true, so an interrupted initialization needs recovery.
3. **Assistant presentation:** a deterministic Prescription requests action opens
   one protected queue/detail/review panel, composing the existing prescription
   components. No new LLM tool is needed for launch. Clinical media, medicine
   lines and patient notes must not enter general assistant messages, prompts,
   model history or telemetry. Existing safety processors remain separately
   subject to approved data processing. Revalidate roles and Store scope on every
   read/action and on Store changes, revoke stale viewer grants and pending UI.
4. **Launch profile and purchase path:** make web/manual/pickup scope authoritative
   on the server; exclude WhatsApp, OCR, delivery and prescription direct-checkout
   paths across public/staff/API/jobs/shared commerce entry points. Evaluate
   existing policy/settings/source adapters first; do not assume another table
   or one blanket global toggle solves per-Store/channel scope. Keep generic
   non-pharmacy commerce unchanged. Preserve cancellation/refund routes needed
   to resolve a paid pickup.
5. **Real private-media operation:** implement/select the approved production
   storage/delivery and safety adapters and their recovery behavior. OCR is
   optional, but private storage, malware/media safety and authorized original
   access are required for remote upload. Do not substitute the in-memory fixture
   or treat selecting a provider as a completed implementation.

No database migration is assumed. First inspect existing fields and repositories
against the selected contracts; if persistence must change, prepare the smallest
reviewable change through the repository's normal Prisma workflow when authorized.

## Delivery order after separate implementation authorization

Six proposed slices, **0/6 started under this plan**. This denominator measures
new simplification work only; it does not reset existing implementation progress.
The slices are coherent changes, not six mandatory approval or test ceremonies.

| ID | Slice | Dependencies | Reviewable exit |
| --- | --- | --- | --- |
| PHL-01 | Pin web/manual/pickup contract; review integrated customer/staff states in the existing Workshop system | None | Exact roles, source/revision binding, catalog scope, permission refusals, customer recovery, and keep/hide/defer composition recorded. Retain prior design/history. UI review precedes implementation; this task creates no Workshop revision. |
| PHL-02 | Enforce pilot channel/catalog/fulfilment scope; simplify setup and public links | PHL-01 | Deferred paths fail at server/API/job entry points and disappear from the pilot UI; ordinary commerce remains intact. |
| PHL-03 | Complete private upload and manual-from-media processing | PHL-01; PHL-02 before exposing it | Real adapter boundary and safe-original manual entry work with verified lines, current pharmacist release, retry and revision conflict handling. Provider activation remains separate. |
| PHL-04 | Integrate customer structured entry and staff Assistant queue/panels | PHL-02 and PHL-03 | One canonical request from customer submission through human review; no guest-text prerequisite, AI clinical input or duplicate inbox; old secure routes remain usable. |
| PHL-05 | Join released quote, existing payment, status and pickup; focused candidate acceptance | PHL-04 | Exact paid pickup and recovery journey plus money/permission/concurrency negative cases pass on the declared candidate. Existing valid evidence is reused. |
| PHL-06 | Assemble one-Store operating evidence and rollout/rollback packet | Candidate from PHL-05 | Applicable evidence and remaining decisions are explicit; exact candidate, Store, providers, disabled paths and stop/rollback are reviewable. Preparing this packet does not enable Production. |

PHL-02 and PHL-03 can be prepared independently after the contract is fixed.
Implementing agents should follow current ownership protocol and existing checkout
rules. This plan does not delegate work or request another worker.

## Acceptance without a large new test project

For this planning change: source review, official-policy check, offline doctor,
link/diff review and a scoped fast-smoke **plan only**. No live DB, model/provider
calls, application build, browser/device QA, order submission or fixtures.

For the future implementation, use `docs/testing.md`, `qa:doctor`, the owned-path
quick-smoke plan and required H01/H02 gates. Add or reuse focused tests where they
expose the changed failure; do not mirror component implementations or repeat
unchanged provider/native/theme/viewport matrices.

- One representative customer-web to merchant-Assistant to paid-pickup journey.
- Relevant refusal/recovery cases: closed launch gate; cross-Tenant/Store access;
  revoked role/viewer capability; unsafe media; stale media/transcript or Quote;
  retry/double submission; interrupted manual initialization; stock shortage;
  duplicate acceptance/payment callback/handoff; failed payment; cancellation or
  refund with correct money ownership; expired private link and recovery.
- Prove deferred WhatsApp intake/outbox, OCR dispatch, delivery and direct prescription
  checkout cannot be reached through generic routes, deep links or stale clients.
- Confirm the general model input/response/history/telemetry cannot receive the
  protected clinical panel's data, including errors and attachment references.
- Runtime/provider evidence must match the actual candidate and approved target.
  Use existing-data smoke; never submit a sale or create fixtures just to obtain a
  passing ordinary smoke receipt. Any dedicated transaction acceptance needs its
  separately authorized test target and data.

## Remaining launch evidence

The existing [owner evidence packet](../../.brain/launch/pharmacy-activation-owner-review-packet.md)
is the starting point. Narrow its applicable scope to **web, manual review,
existing payment and pickup**; annotate WhatsApp/OCR/delivery/native-only rows as
excluded with evidence of server refusal. Do not leave their canaries as launch
prerequisites and do not mark their capabilities approved.

| Evidence group | Required for this scope |
| --- | --- |
| Licensed operator and product policy | Exact Store, verified responsible pharmacist, EwaTrade/pharmacy roles and applicable electronic-pharmacy approval; permitted items and valid-prescription rules; documented clarification, decline and incident procedures |
| Patient data | Approved consent/notice, current version binding, retention/rights schedule and data-processing terms/regions for actual storage and screening; safe original access and recovery |
| Payment and pickup | Approved pharmacy payment ownership and callback/reconciliation/refund evidence; pickup SOP and safe handoff; no clinical approval inferred from payment |
| Candidate and client reachability | Exact source, schema compatibility, public and staff access, web recovery, disabled-channel proof and native/stale-client exclusion |
| Controlled activation | Named release/incident owner, explicit target approval, stop criteria, rollback and preservation of existing records before changing the production gate |

These are five evidence groups, not a claim that every underlying item is
unstarted or that production is five easy steps away. No live provider or licence
inventory was rechecked in this planning task. Existing Brain records retain the
unapproved launch boundary. Current
[PCN regulations](https://pcn.gov.ng/wp-content/uploads/2026/04/Electronic-Pharmacy-Regulation-2026-B81-108.pdf)
remain a primary operating-review source; web entry does not itself settle the
pharmacy's or EwaTrade's regulatory role.

If remote media approval/operation is unavailable, keep public prescription
submission closed. A staff-only assisted trial may be proposed separately with
its own approved original-prescription procedure; it does not fulfil the owner's
two-sided remote launch and must not be reported as that launch completing.

## Progress and Brain impact

- [x] Audit current source and distinguish available code from live acceptance.
- [x] Check official WhatsApp policy and confirm both customer/staff entry points.
- [x] Record keep/hide/defer decisions, minimal gaps and six ordered slices.
- [x] Finish documentation/link/diff review and commit the tracked plan.

Planning is **4/4 complete (100%)**; implementation is **0/6 started (0%)** under
this plan. This is planning completion, not pharmacy feature or release acceptance.

Brain impact: update Prescription Commerce with the narrowed planning direction,
record the web-first product decision, and link this plan from BRAIN and the active
task index. Brain files are local-only in this repository and must not be force-added.

## Planning validation receipt

- Source review completed against the inspected pharmacy/Assistant paths; none
  had working-tree changes at the final audit check. Other active work was left
  untouched. This is not an audit of deployed configuration.
- Official WhatsApp policy checked on 28 October 2026.
- `bun run qa:doctor --offline`: passed profile isolation, dependencies and client
  presence; no runtime probes or freshness certification.
- `bun run test:quick --plan --files docs/plans/2026-10-28-pharmacy-launch-simplification.md`:
  passed planning with no unknown paths; selected the existing core QA tooling
  group. This is the owned-document scope only; no tests were executed.
- All 22 local links in this plan and its Brain decision resolved; six unique
  delivery rows and planning-only qualifications checked. Documentation whitespace
  and staged diff reviewed before committing only the tracked plan.
- App tests, live database/provider/model calls, UI/device checks and release
  operations were unnecessary for this documentation-only delivery and were not
  performed. Future implementation acceptance is defined above.

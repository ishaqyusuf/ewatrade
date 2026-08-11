# 06B - Enforce Store Quotation Approval And Release

**What to build:** Let every Store explicitly trust assigned attendants to
release Quotations or require a different selected team member to approve the
exact current Quote Version before it can be sent to the customer, across web,
staff-assisted, QR and WhatsApp origins.

**Blocked by:** 04 - Generalize WhatsApp Connection And Location Binding; 06 -
Reuse Quote Payment And Order Conversion; 11 - Enforce Vertical And
Jurisdiction Eligibility.

**Status:** complete; Tickets 04, 06 and 11 prerequisites are complete

**Approval:** Added through the owner-approved Store team/quotation-approval
amendment on 2026-08-10.

- [x] Extend Ticket 04's Store-scoped active-membership assignment seam with a
  separate `quote_approver` capability while reusing its `attendant`
  capability. Reuse the existing staff-invite/onboarding identity and never
  create a channel-owned shadow account.
- [x] Add **Team & routing** and **Quotation approval** sections to Customer
  Channels configuration. `Assign attendants` selects who handles requests;
  `Require approval before sending` defaults off and, when enabled, requires at
  least one active selected quotation approver.
  The server rejects a sole attendant selecting themselves as the only
  approver, so a one-person Store cannot enable a deadlocked policy.
- [x] Persist an explicit revisioned Store release mode of
  `attendant_can_release | approval_required`. Existing Stores use a typed
  attendant-release compatibility default and are backfilled before the old
  path can contract; missing or malformed client input never selects authority.
- [x] Keep configuration Owner/Admin-only. Allow `Add team member` to enter the
  existing invite flow and return only accepted active memberships to Store
  assignment; do not accept email/phone as an approval identity.
- [x] Separate Quote preparation from release. Default mode may prepare and
  release atomically for an active assigned attendant; approval-required mode
  creates a private `DRAFT` current version plus one `pending` approval record,
  with no customer acceptance token, outbound intent, Order, reservation or
  payment effect and no source quoted transition.
- [x] Define approval lifecycle exactly as `pending | approved | rejected |
  superseded`. Approval atomically changes the Quote Version from `DRAFT` to
  `ISSUED`; staff rejection does not reuse customer `DECLINED` and requires a
  new immutable version before resubmission. Revision supersedes only a still-
  pending decision and preserves prior approved/rejected audit history.
- [x] Make the release transaction the only owner of `ISSUED`, the source
  `QUOTED` transition, source/Quote audit and usage facts, public acceptance
  capability and any customer notification intent. Exact replay returns the
  released result without repeating those effects; rejection/revision emits no
  issued fact.
- [x] Record one Tenant/Store/Quote-Version-unique approval status and append-
  only transition audit for pending/approved/rejected/superseded, including
  requester, decision actor, policy revision, timestamps and bounded reason
  without customer content or bearer capabilities.
- [x] Permit approval only from an active selected Store approver who is not the
  Quote creator. Approval revalidates membership, assignments, policy,
  vertical/professional gates, current Quote Version, expiry, Offer Option
  totals and availability inside the same bounded transaction that releases
  the version.
- [x] Supersede any pending decision when the Quote is revised, revoked,
  expired or otherwise leaves the releasable state. Preserve an approved/
  rejected decision as historical evidence even when its version is later
  superseded; it never applies to a new version, changed total, currency, Store,
  fulfilment promise or Offer Option.
- [x] Keep commercial approval separate from Pharmacy clinical release. One
  user may hold attendant, quotation-approver and pharmacist capabilities, but
  Pharmacy must complete its professional release before commercial approval
  can expose the Quote.
- [x] Project `canPrepare`, `canRequestApproval`, `canApprove`, `canReject` and
  `canRelease` from the server. Customer/public/WhatsApp projections expose
  only released `ISSUED` versions and safe pending/rejected recovery; UI and
  Communications never reconstruct approval from roles.
- [x] Invalidate the exact Store team/policy projection, Quote detail/queue,
  pending-approval queue and current public capability only after the relevant
  transaction succeeds; preserve pending errors and form state until recovery.
- [x] Prove default attendant release, approval-required release, rejection and
  revision, creator self-approval denial, removed/suspended approver, concurrent
  approval, replay, policy revision, cross-Tenant/Store rejection and
  pharmacist-as-attendant/approver composition in focused tests, verified Neon
  acceptance and authenticated desktop/mobile browser QA.
- [x] Update Brain/API/database/migration documentation with exact implemented
  contracts; production schema application and business activation remain
  separately authorized.

## Completion evidence

- Shared contract, repository, Quote orchestration, Pharmacy communication,
  API-schema/router and dashboard-controller focused suites pass; affected
  Service Commerce, database, API and dashboard package typechecks pass.
- Final review corrections prove absent-policy-only compatibility, explicit
  Store-attendant enforcement after persistence, one bounded Serializable
  retry for concurrent exact replay, and atomic stale-decision supersession on
  queue, detail and direct decision paths. The final Spec and Standards axes
  both pass with no remaining hard finding.
- The canonical verified `.env.local` Neon run passes 2 tests and 17 assertions:
  private draft/pending privacy, different selected approver, creator denial,
  fresh concurrent approval plus exact replay with distinct public tokens,
  atomic source/public release, rejection, immutable revision and preserved
  decision history.
- Authenticated desktop and 390 x 844 mobile browser QA passes Team & routing,
  default-off policy, selected-account configuration, success recovery and the
  pending-approval empty state. The run-owned synthetic Tenant/User fixture was
  removed atomically afterward. Local direct service origins were used because
  the existing Portless development login return path resolves the dashboard
  `next` pathname on the marketing host; that unrelated local-auth issue is not
  represented as fixed by this ticket.
- Prisma generated and applied
  `20260811021755_service_commerce_quote_release_approval` to the verified Neon
  development database, and `bun db:push` confirmed it synchronized. No local
  Docker/PostgreSQL, production database, reset, data-loss override, live
  provider mutation or hand-authored migration SQL was used.

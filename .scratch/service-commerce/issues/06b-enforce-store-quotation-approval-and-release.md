# 06B - Enforce Store Quotation Approval And Release

**What to build:** Let every Store explicitly trust assigned attendants to
release Quotations or require a different selected team member to approve the
exact current Quote Version before it can be sent to the customer, across web,
staff-assisted, QR and WhatsApp origins.

**Blocked by:** 04 - Generalize WhatsApp Connection And Location Binding; 06 -
Reuse Quote Payment And Order Conversion; 11 - Enforce Vertical And
Jurisdiction Eligibility.

**Status:** approved; blocked by Tickets 04 and 06

**Approval:** Added through the owner-approved Store team/quotation-approval
amendment on 2026-08-10.

- [ ] Extend Ticket 04's Store-scoped active-membership assignment seam with a
  separate `quote_approver` capability while reusing its `attendant`
  capability. Reuse the existing staff-invite/onboarding identity and never
  create a channel-owned shadow account.
- [ ] Add **Team & routing** and **Quotation approval** sections to Customer
  Channels configuration. `Assign attendants` selects who handles requests;
  `Require approval before sending` defaults off and, when enabled, requires at
  least one active selected quotation approver.
- [ ] Persist an explicit revisioned Store release mode of
  `attendant_can_release | approval_required`. Existing Stores use a typed
  attendant-release compatibility default and are backfilled before the old
  path can contract; missing or malformed client input never selects authority.
- [ ] Keep configuration Owner/Admin-only. Allow `Add team member` to enter the
  existing invite flow and return only accepted active memberships to Store
  assignment; do not accept email/phone as an approval identity.
- [ ] Separate Quote preparation from release. Default mode may prepare and
  release atomically for an active assigned attendant; approval-required mode
  creates a private `DRAFT` current version plus one `pending` approval record,
  with no customer acceptance token, outbound intent, Order, reservation or
  payment effect and no source quoted transition.
- [ ] Define approval lifecycle exactly as `pending | approved | rejected |
  superseded`. Approval atomically changes the Quote Version from `DRAFT` to
  `ISSUED`; staff rejection does not reuse customer `DECLINED` and requires a
  new immutable version before resubmission. Revision supersedes only a still-
  pending decision and preserves prior approved/rejected audit history.
- [ ] Make the release transaction the only owner of `ISSUED`, the source
  `QUOTED` transition, source/Quote audit and usage facts, public acceptance
  capability and any customer notification intent. Exact replay returns the
  released result without repeating those effects; rejection/revision emits no
  issued fact.
- [ ] Record one Tenant/Store/Quote-Version-unique approval status and append-
  only transition audit for pending/approved/rejected/superseded, including
  requester, decision actor, policy revision, timestamps and bounded reason
  without customer content or bearer capabilities.
- [ ] Permit approval only from an active selected Store approver who is not the
  Quote creator. Approval revalidates membership, assignments, policy,
  vertical/professional gates, current Quote Version, expiry, Offer Option
  totals and availability inside the same bounded transaction that releases
  the version.
- [ ] Supersede any pending decision when the Quote is revised, revoked,
  expired or otherwise leaves the releasable state. Preserve an approved/
  rejected decision as historical evidence even when its version is later
  superseded; it never applies to a new version, changed total, currency, Store,
  fulfilment promise or Offer Option.
- [ ] Keep commercial approval separate from Pharmacy clinical release. One
  user may hold attendant, quotation-approver and pharmacist capabilities, but
  Pharmacy must complete its professional release before commercial approval
  can expose the Quote.
- [ ] Project `canPrepare`, `canRequestApproval`, `canApprove`, `canReject` and
  `canRelease` from the server. Customer/public/WhatsApp projections expose
  only released `ISSUED` versions and safe pending/rejected recovery; UI and
  Communications never reconstruct approval from roles.
- [ ] Invalidate the exact Store team/policy projection, Quote detail/queue,
  pending-approval queue and current public capability only after the relevant
  transaction succeeds; preserve pending errors and form state until recovery.
- [ ] Prove default attendant release, approval-required release, rejection and
  revision, creator self-approval denial, removed/suspended approver, concurrent
  approval, replay, policy revision, cross-Tenant/Store rejection and
  pharmacist-as-attendant/approver composition in focused tests, verified Neon
  acceptance and authenticated desktop/mobile browser QA.
- [ ] Update Brain/API/database/migration documentation with exact implemented
  contracts; production schema application and business activation remain
  separately authorized.

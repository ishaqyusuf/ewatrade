# ADR-0032: Store Team Routing And Quote Release Approval

## Status

Accepted as a product and architecture amendment on 2026-08-10. The owner
approved Store-level attendant assignment and optional quotation approval as
part of Customer Channels configuration. The Service Commerce source batch is
now 17 tickets. Ticket 06B implemented the decision on 2026-08-11, including a
server-side maker-checker guard that rejects a sole attendant selecting
themselves as the only approver. Production schema and rollout remain
separately authorized.

## Context

Customer Channels configuration must answer both who receives customer
requests and whether an attendant may release a quotation without another
person's decision. These concerns belong in one understandable onboarding
journey, but they are not properties of a WhatsApp number. The same team and
commercial approval must govern web, staff-assisted, QR and WhatsApp requests.

An attendant may also be a pharmacist or hold another vertical role. Those
capabilities must compose without making a generic attendant assignment a
clinical licence, or making commercial approval a substitute for pharmacist
release.

The current Commerce Quote command moves a new version directly to `ISSUED`.
Optional approval therefore needs an explicit version-owned release boundary;
a UI-only checkbox or notification cannot safely enforce it.

## Decision

- `Settings > Channels` keeps the single onboarding journey and adds Store-
  scoped **Team & routing** and **Quotation approval** configuration inside the
  `configure` stage. Connection credentials and Store commercial policy remain
  separate server-owned records even though the UI composes them.
- Team selection uses existing active Tenant memberships. Channels may link to
  the existing staff-invite flow, but cannot create shadow users or store email
  addresses as approver identities.
- During expand-contract, existing source-owned Service/Pharmacy actor rules
  remain the compatibility authority until their already-authorized people are
  reconciled into explicit Store assignments. A generic Tenant role alone must
  not silently backfill or broaden attendant access.
- Store operational assignments are additive capabilities. A membership may
  be an attendant, quotation approver, pharmacist or any permitted combination.
  Pharmacy professional-role verification stays Pharmacy-owned.
- Quotation release mode is explicit: `attendant_can_release` or
  `approval_required`. The default is `attendant_can_release`, matching the
  owner's rule that assigned attendants are trusted to quote when no additional
  approval is configured. Missing/null client state never chooses the mode.
- During expand-contract, a Store without the new record resolves through the
  typed compatibility default `attendant_can_release`; setup persists the
  explicit record and reconciliation must backfill it before contraction. Once
  a record exists, either mode requires an active Store attendant assignment;
  the compatibility fallback no longer applies.
- In `approval_required` mode, one active Store quotation approver must approve
  the exact current Quote Version before it can become customer-visible. A
  Quote creator cannot approve their own version; a single-person business
  should retain the default attendant-release mode instead of enabling a
  meaningless self-approval step.
- Preparing a quotation and releasing it are distinct commands. A pending
  version carries no usable public acceptance capability and cannot be sent,
  accepted, ordered, reserved or paid. Approval atomically records the decision
  and releases that exact version; rejection keeps it private and recoverable.
- The existing Quote Version `DRAFT` state is the sole persisted private-
  prepared state. Approval-required preparation adds one version-owned approval
  record with `pending | approved | rejected | superseded`; customer `DECLINED`
  is not reused for a staff rejection. Approval atomically changes `DRAFT` to
  `ISSUED`. A rejected version must be revised into a new immutable version
  before another approval request; only a still-pending decision is marked
  superseded when its version is replaced.
- Preparation leaves the source aggregate in its pre-Quote state. The release
  transaction alone changes the version to `ISSUED`, transitions the source to
  its quoted state, appends source/Quote audit and usage facts, and creates the
  public capability exactly once. Rejection or revision emits no issued fact.
- Any revised Quote Version supersedes the previous pending decision. Approval
  never floats to another version, source, Store, currency, total or Offer
  Option selection.
- Issue and decision commands serialize policy/team and Quote release facts,
  retry one serialization conflict, and preserve exact replay. Direct
  commands/detail plus queue reconciliation atomically supersede pending
  decisions whose version, expiry, source, policy, approver or availability
  facts are no longer releasable.
- Owner/Admin configure the Store team and release policy. Runtime preparation,
  approval and release use server-projected assignments, active membership,
  Store scope, Quote revision, policy revision and vertical eligibility.
- Clinical/professional release and commercial quotation release are separate
  gates. A pharmacist may also be an attendant or approver, but the commercial
  decision cannot satisfy clinical review and vice versa.
- Assignment, policy revision, request, approval, rejection, supersession and
  release are auditable without exposing customer content or bearer tokens.

## Consequences

- The onboarding journey becomes `setup -> configure connection/locations/team/
  approvals -> test -> publish` without coupling commerce governance to one
  transport.
- Businesses that trust attendants keep the shortest path; no approval record
  or second click is required before sending a Quote.
- Businesses needing oversight can select real team members as approvers and
  receive a fail-closed, version-specific maker-checker workflow.
- Removing or suspending a team assignment blocks future actions but does not
  rewrite historical Quote approvals.
- Existing Stores remain operable through the source-owned compatibility
  adapter until audited assignment reconciliation passes; new Store publish
  requires at least one explicit active attendant.
- Public and WhatsApp actions remain server projections; they cannot display or
  send a pending/rejected Quote.
- Ticket 04 owns Store team routing in Customer Channels. New Ticket 06B owns
  the complete quotation-policy configuration and enforcement slice after the
  shared Quote boundary exists.

## Rejected Alternatives

- Store approval on a WhatsApp Connection: web/staff/QR Quotes could bypass it,
  and one Connection may serve multiple Stores with different teams.
- Treat missing configuration as an untyped truthy/falsey auto-approval flag:
  migrations and malformed clients would silently change commercial authority.
- Reuse Pharmacy attendant/pharmacist roles as the global team model: every
  business would inherit clinical vocabulary and unrelated regulatory rules.
- Approve a Quote only in the UI or notification layer: direct API and replayed
  commands could release an unapproved version.
- Let approval survive a revision: the approver would no longer be approving
  the actual lines, options, currency, total, fulfilment or expiry presented.

## References

- `.brain/decisions/ADR-0029-service-commerce-platform-core-and-vertical-capability-extensions.md`
- `.brain/decisions/ADR-0031-customer-channels-generic-request-media-and-selectable-offers.md`
- `.brain/features/service-commerce.md`
- `.scratch/service-commerce/spec.md`
- `.scratch/service-commerce/midday-migration-contract.md`
- `.scratch/service-commerce/issues/06b-enforce-store-quotation-approval-and-release.md`

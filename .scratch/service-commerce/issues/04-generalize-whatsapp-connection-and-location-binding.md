# 04 - Generalize WhatsApp Connection And Location Binding

**What to build:** Generalize the implemented Tenant WhatsApp Connection and
Store binding from prescription naming to a business-neutral Customer Channels
boundary, where a business can manage multiple connections and location
assignments without entering Prescription settings.

**Blocked by:** 01 - Define Service Commerce Boundary And Compatibility
Contract; 02 - Configure Business Capability Profile; 03 - Establish Customer
Request Interoperability Contract; 11 - Enforce Vertical And Jurisdiction
Eligibility.

**Status:** source-complete; live Meta/provider release acceptance remains open

**Approval:** Original scope and revised dependency order owner-approved on
2026-08-09; Customer Channels settings/media-descriptor amendment approved on
2026-08-10.

- [x] Keep each business's WABA, number, sender identity, credential reference, templates, billing owner and lifecycle Tenant-owned.
- [x] Preserve one EwaTrade Meta application/webhook with recipient `phone_number_id` resolution before customer or request lookup.
- [x] Replace prescription-specific binding names behind stable exports using expand-contract compatibility; do not rewrite live callers in one step.
- [x] Preserve manual onboarding, Embedded Signup, explicit authorized-number selection, pending binding and identifier-only readiness jobs.
- [x] Preserve two-phase replacement/rotation so a failed candidate never displaces a working route.
- [x] Support branch-specific and central group numbers only with explicit opaque Store context; reject any ambiguous or cross-Tenant active binding as a whole route.
- [x] Keep direct Meta Cloud API as the initial adapter and Twilio/BSP optional behind provider-neutral Communications.
- [x] Add `Settings > Channels` with page title `Customer channels`, a multiple-
  connection list, lifecycle/readiness status, Store assignments and focused
  `setup -> configure -> test -> publish` controls. `Connect WhatsApp` is the
  CTA; generic connection configuration no longer belongs under Prescription
  settings.
- [x] Add a Store-scoped **Team & routing** configuration step that assigns
  accepted active Tenant memberships as attendants for requests from any
  channel. `Add team member` delegates to existing staff invitation; Channels
  does not create identity or infer a pharmacist licence.
- [x] Preserve existing source-owned Service/Pharmacy actor checks through a
  narrow compatibility adapter, reconcile only already-authorized people into
  explicit Store assignments with audit, and require at least one active
  attendant before a new Store entry point can publish. Tenant role alone never
  grants or backfills Store access.
- [x] Publish a stable, Store-scoped, previewable and revocable EwaTrade entry
  page plus Copy link/Download QR actions. The QR carries only the opaque entry
  token and resolves current allowed web/WhatsApp choices; it never embeds a
  raw provider number, Tenant/Store id or mutable route.
- [x] Let business category and onboarding facts recommend connection defaults
  without treating category, technical readiness or client state as legal or
  operational authorization.
- [x] Normalize inbound image/document descriptors as business-neutral channel
  facts for Ticket 04A; connection/webhook code must not call a Prescription
  storage command or interpret the attachment.
- [x] Prove that connection replacement preserves the stable entry URL/printed
  QR and that central/multi-Store entry requires an opaque Store link or
  explicit branch choice before customer content is accepted.
- [x] Prove per-Store attendant routing, membership suspension/removal and the
  same person's independent attendant/Pharmacy role composition. Ticket 06B
  owns quotation approver assignment and the commercial release workflow.
- [x] Test same-customer isolation, unknown recipient, signature failure,
  duplicate webhook, revoked credentials, connection replacement and central
  branch switching.
- [ ] Recheck current Meta policy/pricing at release and keep pharmacy activation separately fail closed.

## Evidence

- The Store-scoped workspace now reads only validated descriptive onboarding
  facts and returns a nullable typed recommendation. The projection is fixed as
  `advisoryOnly: true` and `authorizationEffect: none`; it contains no readiness,
  activation, role or policy decision and performs no write.
- The recommendation covers web/WhatsApp starting channels, Store-specific or
  central-with-branch-choice routing, owner/team attendant coverage and a
  bounded setup sequence. Pharmacy category guidance adds a separate policy
  review step without treating technical readiness as regulated approval.
- Focused utility, Service Commerce, repository and dashboard checks pass 28
  tests / 130 assertions. Database, API, dashboard, Service Commerce and utils
  typechecks pass; the direct `pg` drift-inventory dependency now declares its
  TypeScript types at the owning database package boundary.
- Authenticated browser acceptance passed at 1280x720 and 390x844 against one
  run-owned `.env.local` Neon fixture. The advisory copy, Store-specific
  recommendation and every existing Channels action were visible and keyboard
  reachable; healthy-state console output was clean and compact layout had no
  page-level horizontal overflow. Exact cleanup verified the run-owned Tenant
  and users at zero.
- Focused routing, signature, Connection rotation and provider-retry checks pass
  48 tests / 108 assertions. The verified `.env.local` Neon routing matrix
  passes 1 test / 16 assertions: a duplicate provider event reuses one row and
  two concurrent workers produce exactly one atomic `RECEIVED -> PROCESSING`
  claim, alongside independent/central routing, hostile cross-Tenant rejection,
  branch selection and revocation. Existing Store-team and quote-release proofs
  reject inactive/removed memberships and keep attendant, pharmacist and
  commercial-approver capabilities independent.
- Live Meta policy/pricing review and provider release acceptance remain open;
  this evidence does not authorize a live provider action.

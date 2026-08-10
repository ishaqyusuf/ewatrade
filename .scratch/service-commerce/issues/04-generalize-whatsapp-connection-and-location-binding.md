# 04 - Generalize WhatsApp Connection And Location Binding

**What to build:** Generalize the implemented Tenant WhatsApp Connection and
Store binding from prescription naming to a business-neutral Customer Channels
boundary, where a business can manage multiple connections and location
assignments without entering Prescription settings.

**Blocked by:** 01 - Define Service Commerce Boundary And Compatibility
Contract; 02 - Configure Business Capability Profile; 03 - Establish Customer
Request Interoperability Contract; 11 - Enforce Vertical And Jurisdiction
Eligibility.

**Status:** approved; blockers complete

**Approval:** Original scope and revised dependency order owner-approved on
2026-08-09; Customer Channels settings/media-descriptor amendment approved on
2026-08-10.

- [ ] Keep each business's WABA, number, sender identity, credential reference, templates, billing owner and lifecycle Tenant-owned.
- [ ] Preserve one EwaTrade Meta application/webhook with recipient `phone_number_id` resolution before customer or request lookup.
- [ ] Replace prescription-specific binding names behind stable exports using expand-contract compatibility; do not rewrite live callers in one step.
- [ ] Preserve manual onboarding, Embedded Signup, explicit authorized-number selection, pending binding and identifier-only readiness jobs.
- [ ] Preserve two-phase replacement/rotation so a failed candidate never displaces a working route.
- [ ] Support branch-specific and central group numbers only with explicit opaque Store context; reject any ambiguous or cross-Tenant active binding as a whole route.
- [ ] Keep direct Meta Cloud API as the initial adapter and Twilio/BSP optional behind provider-neutral Communications.
- [ ] Add `Settings > Channels` with page title `Customer channels`, a multiple-
  connection list, lifecycle/readiness status, Store assignments and focused
  `setup -> configure -> test -> publish` controls. `Connect WhatsApp` is the
  CTA; generic connection configuration no longer belongs under Prescription
  settings.
- [ ] Publish a stable, Store-scoped, previewable and revocable EwaTrade entry
  page plus Copy link/Download QR actions. The QR carries only the opaque entry
  token and resolves current allowed web/WhatsApp choices; it never embeds a
  raw provider number, Tenant/Store id or mutable route.
- [ ] Let business category and onboarding facts recommend connection defaults
  without treating category, technical readiness or client state as legal or
  operational authorization.
- [ ] Normalize inbound image/document descriptors as business-neutral channel
  facts for Ticket 04A; connection/webhook code must not call a Prescription
  storage command or interpret the attachment.
- [ ] Prove that connection replacement preserves the stable entry URL/printed
  QR and that central/multi-Store entry requires an opaque Store link or
  explicit branch choice before customer content is accepted.
- [ ] Test same-customer isolation, unknown recipient, signature failure, duplicate webhook, revoked credentials, connection replacement and central branch switching.
- [ ] Recheck current Meta policy/pricing at release and keep pharmacy activation separately fail closed.

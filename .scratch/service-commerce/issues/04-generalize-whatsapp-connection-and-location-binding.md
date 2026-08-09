# 04 - Generalize WhatsApp Connection And Location Binding

**What to build:** Generalize the implemented Tenant WhatsApp Connection and Store binding from prescription naming to a business-neutral channel boundary while preserving every pharmacy routing and readiness invariant.

**Blocked by:** 01 - Define Service Commerce Boundary And Compatibility Contract; 02 - Configure Business Capability Profile.

**Status:** proposed; awaiting owner approval

**Approval gate:** Planning only. Do not implement until the owner explicitly approves this ticket batch.

- [ ] Keep each business's WABA, number, sender identity, credential reference, templates, billing owner and lifecycle Tenant-owned.
- [ ] Preserve one EwaTrade Meta application/webhook with recipient `phone_number_id` resolution before customer or request lookup.
- [ ] Replace prescription-specific binding names behind stable exports using expand-contract compatibility; do not rewrite live callers in one step.
- [ ] Preserve manual onboarding, Embedded Signup, explicit authorized-number selection, pending binding and identifier-only readiness jobs.
- [ ] Preserve two-phase replacement/rotation so a failed candidate never displaces a working route.
- [ ] Support branch-specific and central group numbers only with explicit opaque Store context; reject any ambiguous or cross-Tenant active binding as a whole route.
- [ ] Keep direct Meta Cloud API as the initial adapter and Twilio/BSP optional behind provider-neutral Communications.
- [ ] Test same-customer isolation, unknown recipient, signature failure, duplicate webhook, revoked credentials, connection replacement and central branch switching.
- [ ] Recheck current Meta policy/pricing at release and keep pharmacy activation separately fail closed.

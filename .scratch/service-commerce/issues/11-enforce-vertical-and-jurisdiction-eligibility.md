# 11 - Enforce Vertical And Jurisdiction Eligibility

**What to build:** Add a fail-closed server policy boundary that determines whether a vertical, capability and communication channel may operate for a Store and jurisdiction, with reviewable evidence and expiry.

**Blocked by:** 01 - Define Service Commerce Boundary And Compatibility Contract; 02 - Configure Business Capability Profile; 04 - Generalize WhatsApp Connection And Location Binding.

**Status:** approved; blocked

**Approval:** Owner-approved on 2026-08-09. Start only after every listed blocker is complete.

- [ ] Define typed policy outcomes for allowed, restricted, pending evidence, expired approval and prohibited combinations.
- [ ] Require explicit Store jurisdiction, vertical, channel, licence/approval reference, reviewer, effective/expiry dates and reason.
- [ ] Evaluate policy at activation, public-link/action projection, intake, outbound messaging and provider job execution.
- [ ] Fail closed on missing, stale, ambiguous or changed policy; cache only within an explicit invalidation/expiry contract.
- [ ] Keep policy/legal evidence references private and audit every read/change/override attempt.
- [ ] Encode no legal conclusion in UI code or provider adapters; release owners update reviewed policy data through an authorized command.
- [ ] Keep Nigerian Pharmacy WhatsApp blocked pending written Meta/legal approval under the current published regulated-vertical policy.
- [ ] Test jurisdiction changes, approval expiry/revocation, channel differences, cross-Tenant access and job-time reauthorization.
- [ ] Add a release runbook step to recheck current official Meta policy and pricing before activation.

# 11 - Enforce Vertical And Jurisdiction Eligibility

**What to build:** Add a fail-closed server policy boundary that determines whether a vertical, capability and communication channel may operate for a Store and jurisdiction, with reviewable evidence and expiry.

**Blocked by:** 01 - Define Service Commerce Boundary And Compatibility
Contract; 02 - Configure Business Capability Profile; 03 - Establish Customer
Request Interoperability Contract.

**Status:** complete

**Approval:** Original scope, revised dependency order, and Progressive Catalog
policy inputs owner-approved on 2026-08-09.

- [x] Define typed policy outcomes for allowed, restricted, pending evidence, expired approval and prohibited combinations.
- [x] Require explicit Store jurisdiction, vertical, channel, licence/approval reference, reviewer, effective/expiry dates and reason.
- [x] Evaluate policy at activation, public-link/action projection, intake, outbound messaging and provider job execution.
- [x] Fail closed on missing, stale, ambiguous or changed policy; cache only within an explicit invalidation/expiry contract.
- [x] Keep policy/legal evidence references private and audit every read/change/override attempt.
- [x] Encode no legal conclusion in UI code or provider adapters; release owners update reviewed policy data through an authorized command.
- [x] Keep Nigerian Pharmacy WhatsApp blocked pending written Meta/legal approval under the current published regulated-vertical policy.
- [x] Decide whether progressive draft capture, Catalog publication,
  procure-to-order availability, reusable price promotion and managed-inventory
  graduation are allowed independently for each vertical/jurisdiction.
- [x] Test jurisdiction changes, approval expiry/revocation, channel differences, cross-Tenant access and job-time reauthorization.
- [x] Add a release runbook step to recheck current official Meta policy and pricing before activation.

**Evidence:** Implemented typed shared policy contracts, revisioned
Tenant/Store policy decisions and private evidence reads, append-only read/
change/override audit, protected release-owner commands, source/public/intake/
activation enforcement, pre-persistence media, checkout and fulfilment
reauthorization, Pharmacy WhatsApp channel-plus-intake binding, policy-gated
notification intents and job-time provider-send reauthorization, and
independent Progressive Catalog subjects. The additive
schema was synchronized non-destructively to verified `.env.local` Neon. The
focused shared/DB/API/jobs regression set passed 119 tests with 311 assertions;
all four affected workspace typechecks passed. The
dedicated policy acceptance passed with 9 assertions; the existing Service,
Inquiry, profile, pickup and delivery Neon matrix passed all 10 scenarios. The
final combined run's one transient manual-fee transaction-start `P2028` passed
an isolated rerun with 17 assertions. No
production approval, provider activation or migration rollout is claimed.

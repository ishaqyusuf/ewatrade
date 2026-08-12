# 09 — Control Store Conversation Availability And Manual Pause

**What to build:** Let Store owners/admins configure when EwaTrade Chat accepts
new customer messages, based on service hours, active eligible team coverage,
vertical/professional policy, and manual pause. Customers see truthful
availability, disabled submission, reopening guidance, and recoverable drafts.

**Blocked by:** 04 — Complete Store Queue Assignment And Audited Handoff; 05 — Add The Mobile Customer Shell And Universal Store Links

**Status:** ready-for-agent

- [ ] Store configuration supports revisioned conversation service hours,
      timezone, manual pause/resume with reason, and safe customer wording.
- [ ] Server availability combines desired Chat mode, current time, at least one
      active eligible attendant, required Pharmacy/professional coverage,
      current policy, capability, and manual pause.
- [ ] Staff browser/socket presence is not an availability authority and cannot
      cause customer-facing state to flicker.
- [ ] Public projection returns only `available`, known reopening, or indefinite
      unavailable plus allowlisted recovery; it does not disclose staff names,
      licence detail, internal policy reason, or operational incident content.
- [ ] Unavailable customers can read history and execute only independently
      current safe actions; composer, attachments, and voice submission are
      disabled before upload/commit.
- [ ] Web and mobile preserve unsent text/attachment metadata locally for a
      bounded period, clearly label it unsent, and restore it when service
      becomes available without automatic submission.
- [ ] Existing staff work and permitted outbound responses can continue during
      pause subject to current assignment, source, professional, and policy
      checks.
- [ ] Availability transitions and configuration changes are actor/time/revision
      audited and use payload-bound idempotency.
- [ ] Concurrent pause/resume, schedule boundary, timezone/DST, attendant
      removal, professional loss, policy change, and stale configuration fail
      deterministically.
- [ ] Dashboard configuration uses the established server-prefetch/form/sheet
      contract with precise invalidation, error/retry, and permission states.
- [ ] Verified-database and browser/native acceptance proves available,
      scheduled-closed, coverage-missing, policy-blocked, manually paused,
      reopening, draft recovery, and no rejected write/media side effects.
- [ ] Brain schema, API, permission, feature, Customer Channels, policy, and task
      docs distinguish availability from online presence and provider readiness.

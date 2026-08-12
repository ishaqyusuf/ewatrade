# 13 — Configure EwaTrade Chat, WhatsApp, Or Both In Customer Channels

**What to build:** Let Owners/Admins configure a Store's desired customer
conversation mode, hours, coverage, pause, QR publication, and recovery in
Customer Channels while the server derives an effective EwaTrade Chat,
WhatsApp, or Both mode from current policy and provider readiness.

**Blocked by:** 01 — Preserve Store QR Entry On The Shared Chat Host; 09 — Control Store Conversation Availability And Manual Pause

**Status:** ready-for-agent

- [ ] Store Conversation Mode is exactly EwaTrade Chat, WhatsApp, or Both and is
      revisioned/audited independently from provider Connection lifecycle.
- [ ] Owners/Admins configure desired mode; clients display but never derive the
      effective mode or authorization from category, connection status, or
      previously successful setup.
- [ ] Effective Chat requires current conversation capability, availability
      configuration, eligible team coverage, vertical policy, and no manual
      pause for new inbound submission.
- [ ] Effective WhatsApp requires current policy, active Store binding, provider
      Connection/readiness, eligible operation/template/window, and exact Store
      routing; ambiguity and cross-Tenant bindings fail closed.
- [ ] WhatsApp-only mode keeps EwaTrade history/current safe actions readable,
      disables its composer, and shows primary `Continue on WhatsApp` recovery.
- [ ] Both mode keeps EwaTrade composer available and shows secondary `Reach the
      Store faster on WhatsApp`; Chat-only mode exposes no WhatsApp CTA.
- [ ] Mode changes never delete/hide conversation history, typed Requests,
      Quotes, payments, fulfilment actions, provider receipts, or audits.
- [ ] Business profile/category recommendations remain strict advisory-only
      defaults and cannot activate Chat, WhatsApp, attachments, or professional
      permissions.
- [ ] Nigeria Pharmacy WhatsApp remains unavailable without current explicit
      written approval even when the technical Connection is ready; UI provides
      safe policy recovery rather than an override.
- [ ] Customer Channels groups setup, configuration, testing, publication,
      hours, attendants, mode, QR/link, readiness, and recovery without moving
      clinical controls out of Compliance.
- [ ] Focused policy/readiness/concurrency tests cover all desired/effective mode
      combinations, stale revisions, provider rotation/revocation, attendant
      loss, manual pause, and Pharmacy denial.
- [ ] Authenticated dashboard plus public desktop/mobile acceptance covers
      configure/save, loading/error/retry, unavailable states, QR stability,
      mode transitions, and no history loss.
- [ ] Brain Customer Channels, policy, API, permission, feature, ADR, and task
      docs distinguish desired configuration from effective authorization.

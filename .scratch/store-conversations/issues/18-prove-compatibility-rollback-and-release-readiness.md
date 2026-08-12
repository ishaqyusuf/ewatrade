# 18 — Prove Compatibility, Rollback, And Release Readiness

**What to build:** Integrate and verify the complete Store Conversation product
across web, mobile, dashboard, typed Requests, Pharmacy controls, media,
realtime, notifications, actions, WhatsApp bridging, reporting, security, and
expand-contract rollout, while retaining a tested Store-level rollback and
leaving production switch/contraction separately authorized.

**Blocked by:** 06 — Send Private Images And Documents Through Conversations; 07 — Send And Play Bounded Private Voice Notes; 08 — Deliver Realtime Messages, Read State, And Foreground Alerts; 09 — Control Store Conversation Availability And Manual Pause; 10 — Render Quotes And Customer Actions Inside The Timeline; 11 — Offer Optional Account Adoption And Explicit Guest Linking; 12 — Notify Customers About Unread Responses And Store Reopening; 13 — Configure EwaTrade Chat, WhatsApp, Or Both In Customer Channels; 14 — Bridge An EwaTrade Conversation To WhatsApp Explicitly; 15 — Handle Direct WhatsApp Discovery And The Mixed-Channel Timeline; 16 — Complete Guest Recovery, Privacy, Moderation, And Retention Controls; 17 — Report Conversation Service Quality Without Customer Content

**Status:** ready-for-agent

- [ ] One server-owned Store-cohort switch can enable the shared-host
      conversation experience without client-derived category/version behavior;
      disabling it restores the prior entry/request experience without deleting
      new records.
- [ ] Existing Store Entry tokens, public Request/Prescription capabilities,
      Quotes, payments, bookings, pickup/delivery, Pharmacy workspaces,
      Customer Channels, and provider routing remain compatible throughout
      expansion.
- [ ] Historical Requests are never attached to a guest/account through contact
      matching; only current proven capabilities may create a safe compatibility
      link, and unprovable history remains outside the conversation.
- [ ] Full verified-Neon lifecycle covers anonymous web and mobile guests,
      multiple Product/Service/Prescription Requests, image/PDF/voice, staff
      claim/reply/handoff, realtime/read, availability, Quote/action/payment/
      fulfilment, account link, notifications, modes, bridge/direct WhatsApp,
      moderation, reporting, and exact fixture cleanup.
- [ ] Same customer/contact/device/provider identity across multiple Stores and
      Tenants remains isolated through entry, conversation, media, staff,
      notification, bridge, Quote, payment, and report paths.
- [ ] Concurrency/replay matrix covers message append, Request creation,
      assignment/reply, read watermark, media commit, Action execution, account
      link, notification claim, mode/pause change, bridge consume, provider
      receipt, moderation, and rollback.
- [ ] Failure injection covers database/realtime/network loss, media storage/
      safety, notification/push/email/WhatsApp, provider rotation/revocation,
      payment callback, policy change, staff removal, expired credentials,
      malicious input, and partial migration/switch recovery.
- [ ] Authenticated/guest desktop and compact-mobile browser acceptance covers
      shared host, customer conversation, dashboard queue/config/reporting,
      keyboard/screen reader, Back/Forward, error/retry, long timelines,
      responsive containment, healthy console, and safe denial.
- [ ] Native device/simulator acceptance covers Universal/App Links, fresh/
      existing install, Customer/Business shell isolation, secure guest resume,
      transfer, conversation list, attachments/voice, keyboard, realtime,
      push, offline/reconnect, app lifecycle, and device revocation.
- [ ] Approved load/security/privacy thresholds are measured for message append,
      queue reads, realtime fan-out, notification claim, media commit, active
      conversations, bridge ingestion, and reports; unsupported production scale
      remains an explicit gate.
- [ ] Additive migration replay, current development synchronization,
      compatibility census, switch/rollback report, observability alerts, and
      release runbook are verified without destructive reset or manual migration
      artifacts.
- [ ] Live Meta/email/push/media/payment canaries, Pharmacy policy/legal/privacy,
      production migration, traffic switch, and later contraction remain
      individually authorized and are not inferred from source acceptance.
- [ ] All relevant Brain architecture, ADR, feature, schema, relationships,
      migrations, API, permissions, runbooks, task state, and domain language
      match demonstrated behavior and exact remaining gates.

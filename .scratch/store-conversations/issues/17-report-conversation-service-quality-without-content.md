# 17 — Report Conversation Service Quality Without Customer Content

**What to build:** Give authorized Store/Tenant managers aggregate insight into
conversation demand, response, unread, availability, assignment, notifications,
channel modes, WhatsApp bridges, provider reliability, and attributable costs
without selecting or exposing message, media, contact, credential, or clinical
content.

**Blocked by:** 04 — Complete Store Queue Assignment And Audited Handoff; 08 — Deliver Realtime Messages, Read State, And Foreground Alerts; 12 — Notify Customers About Unread Responses And Store Reopening; 15 — Handle Direct WhatsApp Discovery And The Mixed-Channel Timeline

**Status:** ready-for-agent

- [ ] Store and Tenant-wide reports are manager-gated, server-scoped, bounded,
      half-open by authoritative occurrence time, and purpose-audited before
      querying sensitive operational aggregates.
- [ ] Lifecycle metrics cover conversation starts/reopens, Request kinds,
      first-response time, unread duration, archive/reactivation, and safe
      current/terminal outcomes without message content.
- [ ] Team metrics cover unclaimed/overdue counts, assignment/handoff, coverage,
      and SLA recovery without naming staff in broad report projections.
- [ ] Availability metrics separate scheduled closure, manual pause, coverage,
      policy, and provider causes through allowlisted aggregate reason buckets.
- [ ] Notification metrics cover scheduled, cancelled-by-read, coalesced, sent,
      delivered/read where supported, failed, unavailable, and preference/
      consent suppression with unknown versus known-zero costs preserved.
- [ ] Channel metrics cover desired/effective mode, web/mobile/WhatsApp observed
      messages, bridge initiation/confirmation, direct candidate choice, and
      provider reliability without pretending unknown history is zero.
- [ ] Provider, platform, notification, number, and other attributable costs stay
      separate from Store revenue, Quote price, payment value, and unavailable
      cost facts.
- [ ] Queries never select message text, media/audio, contact destinations,
      guest/account/device identifiers, bearer digests, provider operation ids,
      prescription/clinical content, or raw errors.
- [ ] Bounded query caps, deterministic ordering, truncation/unknown markers,
      rate limits, read audit, and safe errors prevent misleading totals or
      unbounded operational reads.
- [ ] Dashboard reports support typed Store/date/detail URL state, loading/empty/
      error/retry, compact tables, accessible drilldown, and no customer/private
      detail.
- [ ] Focused contract/repository/API tests and verified-database acceptance
      prove occurrence windows, Tenant/Store scope, unknown/zero semantics,
      read-audit failure closed, provider replay, and no sensitive fields.
- [ ] Authenticated desktop/mobile-width browser acceptance covers aggregate
      metrics, filters, safe role denial, Back/Forward, error/retry, overflow,
      and clean console.
- [ ] Brain reporting, cost, API, permission, schema, feature, readiness, and task
      docs record exact metrics and remaining production threshold decisions.

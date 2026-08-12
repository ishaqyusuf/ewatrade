# 08 — Deliver Realtime Messages, Read State, And Foreground Alerts

**What to build:** Deliver new customer and Store messages promptly across web
and mobile, recover through durable cursor replay after disconnection, maintain
truthful delivered/read state, and provide accessible foreground visual/sound
alerts without making realtime transport authoritative.

**Blocked by:** 02 — Deliver The First Anonymous Store Conversation Text Loop; 05 — Add The Mobile Customer Shell And Universal Store Links

**Status:** ready-for-agent

- [ ] Initial load and reconnect use one bounded deterministic conversation
      cursor and return every committed message after the last acknowledged
      sequence without gaps or duplicates.
- [ ] Foreground realtime transport is replaceable and degrades to bounded
      cursor refresh; message correctness never depends on an ephemeral socket,
      process memory, or Redis-only state.
- [ ] EwaTrade message states distinguish server accepted, device delivered, and
      customer read; WhatsApp/provider sent/delivered/read/failed facts remain a
      separate dimension.
- [ ] Device delivery acknowledgement and customer read watermark are monotonic,
      payload-bound, idempotent, Tenant/Store/conversation scoped, and cannot
      move backward under out-of-order or concurrent commands.
- [ ] Multiple tabs/devices, reconnect, background/foreground transitions, and
      replay display one message in sequence and converge on the latest safe
      read watermark.
- [ ] A foreground Store response produces a visible alert and optional sound
      only when user/platform permission, focus, accessibility, and silent-mode
      rules permit it.
- [ ] The customer timeline displays safe pending/reconnecting/retry states
      without claiming a message was lost or delivered before evidence exists.
- [ ] Staff queue unread and customer unread projections derive from durable
      participant watermarks, not mutable message flags or page presence.
- [ ] Transport, database, and network failure injection proves accepted writes
      survive, reconnect resumes, duplicates collapse, and stale credentials or
      membership never receive further private data.
- [ ] Focused unit/integration tests cover cursor bounds, ordering, late provider
      callbacks, monotonic watermarks, multi-device races, and redaction.
- [ ] Browser and native acceptance covers foreground delivery, sound permission,
      two-tab/device behavior, offline/reconnect, background resume, loading,
      retry, accessibility status, and clean console/log output.
- [ ] Brain architecture, API, schema, notification, mobile, feature, and task
      records describe durable cursor truth and replaceable realtime delivery.

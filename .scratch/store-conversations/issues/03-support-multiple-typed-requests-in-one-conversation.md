# 03 — Support Multiple Typed Requests In One Store Conversation

**What to build:** Let one continuing Store Conversation safely contain several
Commerce Inquiries, Service Requests, and Prescription Requests. Customers see
clear Request boundaries and status cards, while every clinical, commercial,
work, Quote, and fulfilment operation remains owned by the exact typed source.

**Blocked by:** 02 — Deliver The First Anonymous Store Conversation Text Loop

**Status:** ready-for-agent

- [ ] Entry configuration returns only currently permitted Request kinds; the
      client never derives authorization from business category.
- [ ] A first meaningful message creates the single unambiguous permitted typed
      Request automatically and links it to the Store Conversation exactly once.
- [ ] A Pharmacy image/document intake can create a Prescription Request without
      registration while retaining current consent, clinical-media, and
      professional-review requirements.
- [ ] When several Request kinds are possible, submitted text/media remains
      private and staged until a deterministic in-chat intent choice commits it
      to one typed source.
- [ ] Multiple typed Requests render with explicit separators, source-safe
      status cards, occurrence times, and terminal/current distinction.
- [ ] Completing, cancelling, declining, or converting one Request does not
      close or delete the Store Conversation or alter another Request.
- [ ] A new message attaches automatically only when exactly one active Request
      is eligible; ambiguity requires explicit Request selection and never uses
      customer-facing AI inference.
- [ ] Conversation-level messages are limited to neutral availability, account,
      channel, and recovery facts; Request outcomes always carry the exact typed
      source reference.
- [ ] Existing Prescription, Service, Commerce Inquiry, Quote, Order, booking,
      payment, fulfilment, and policy commands remain authoritative and pass
      their established compatibility suites unchanged.
- [ ] Cross-source replay, stale source revision, foreign Store, and a customer
      with the same contact facts in another Tenant fail closed.
- [ ] Verified-database acceptance proves one conversation across multiple
      Product, Service, and Prescription lifecycles without universal Request
      persistence or clinical-content leakage.
- [ ] Browser acceptance covers new Request creation, intent choice, multiple
      active Request selection, terminal separation, and safe recovery.
- [ ] Brain domain, schema, API, permission, feature, migration, and task docs
      record the conversation-to-typed-source relationship and explicit
      non-goal of a universal workflow.

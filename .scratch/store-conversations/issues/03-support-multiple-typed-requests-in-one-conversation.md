# 03 — Support Multiple Typed Requests In One Store Conversation

**What to build:** Let one continuing Store Conversation safely contain several
Commerce Inquiries, Service Requests, and Prescription Requests. Customers see
clear Request boundaries and status cards, while every clinical, commercial,
work, Quote, and fulfilment operation remains owned by the exact typed source.

**Blocked by:** 02 — Deliver The First Anonymous Store Conversation Text Loop

**Status:** complete

- [x] Entry configuration returns only currently permitted Request kinds; the
      client never derives authorization from business category.
- [x] A first meaningful message creates the single unambiguous permitted typed
      Request automatically and links it to the Store Conversation exactly once.
- [x] A Pharmacy image/document intake can create a Prescription Request without
      registration while retaining current consent, clinical-media, and
      professional-review requirements.
- [x] When several Request kinds are possible, submitted text/media remains
      private and staged until a deterministic in-chat intent choice commits it
      to one typed source.
- [x] Multiple typed Requests render with explicit separators, source-safe
      status cards, occurrence times, and terminal/current distinction.
- [x] Completing, cancelling, declining, or converting one Request does not
      close or delete the Store Conversation or alter another Request.
- [x] A new message attaches automatically only when exactly one active Request
      is eligible; ambiguity requires explicit Request selection and never uses
      customer-facing AI inference.
- [x] Conversation-level messages are limited to neutral availability, account,
      channel, and recovery facts; Request outcomes always carry the exact typed
      source reference.
- [x] Existing Prescription, Service, Commerce Inquiry, Quote, Order, booking,
      payment, fulfilment, and policy commands remain authoritative and pass
      their established compatibility suites unchanged.
- [x] Cross-source replay, stale source revision, foreign Store, and a customer
      with the same contact facts in another Tenant fail closed.
- [x] Verified-database acceptance proves one conversation across multiple
      Product, Service, and Prescription lifecycles without universal Request
      persistence or clinical-content leakage.
- [x] Browser acceptance covers new Request creation, intent choice, multiple
      active Request selection, terminal separation, and safe recovery.
- [x] Brain domain, schema, API, permission, feature, migration, and task docs
      record the conversation-to-typed-source relationship and explicit
      non-goal of a universal workflow.

## Evidence

- Focused Store Conversation contracts/repositories: 26 tests / 87 assertions.
- Established Prescription, Service, Commerce Quote and policy compatibility:
  51 tests / 145 assertions.
- Verified-Neon lifecycle: 2 tests / 29 assertions; exact cleanup verified as
  zero run-owned Tenant and User rows.
- Prisma client/database typecheck, Storefront, API and shared-contract
  typechecks pass. Focused Biome and diff hygiene pass.
- `db:push --local` reports the schema in sync and all 49 migration artifacts
  are applied.
- Desktop and 390px HTTPS browser acceptance proves staged intent choice,
  Product creation, exact active Prescription selection, current/complete cards,
  loading recovery, keyboard reachability, invalid-link 404, clean console and
  body width equal to the viewport.

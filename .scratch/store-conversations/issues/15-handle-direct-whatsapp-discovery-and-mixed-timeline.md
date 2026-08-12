# 15 — Handle Direct WhatsApp Discovery And The Mixed-Channel Timeline

**What to build:** When a customer messages a Store directly on WhatsApp, offer
a recent EwaTrade conversation candidate only with verified Store-scoped
evidence and explicit customer confirmation, then present supported observed
web, mobile, and WhatsApp messages in one honest channel-labelled timeline.

**Blocked by:** 12 — Notify Customers About Unread Responses And Store Reopening; 14 — Bridge An EwaTrade Conversation To WhatsApp Explicitly

**Status:** ready-for-agent

- [ ] Direct inbound candidate search is limited to the exact Tenant/Store and a
      verified Customer Account phone or verified Guest Notification Contact;
      phone alone is never a global identity/merge key.
- [ ] Candidate response is neutral and exposes no Request kind, prescription,
      Quote, amount, message preview, account, or device fact before confirmation.
- [ ] Exactly one current candidate offers `Continue that conversation`, `Start
      a new request`, and `That isn't mine`; only explicit Continue creates a
      Channel Bridge.
- [ ] No match starts a new permitted Store Conversation/typed intake; multiple,
      stale, conflicting, foreign, or ambiguous matches fail closed to a secure
      Store Entry/bridge recovery.
- [ ] `That isn't mine` records bounded suppression/abuse evidence without
      exposing or deleting the candidate and prevents repeated inappropriate
      prompts.
- [ ] Inbound/outbound Cloud API messages and provider sent/delivered/read/failed
      receipts persist idempotently under exact Connection, Tenant, Store,
      Channel Bridge, conversation, and typed Request scope.
- [ ] Supported Business App echo/history events may be imported only through a
      current authorized provider contract with explicit provenance; absence or
      incomplete sync is rendered honestly.
- [ ] Web/mobile mixed timeline labels observed channel, orders events through
      conversation sequence, handles late provider callbacks, and never claims
      arbitrary/full WhatsApp history.
- [ ] EwaTrade device delivery/read and provider delivery/read remain separate;
      one cannot mark the other complete.
- [ ] Provider message deletion/unsupported events become safe immutable status
      or recovery facts rather than destructive database rewrites.
- [ ] Focused tests cover verified/unverified contacts, same phone across Stores/
      Tenants/accounts, multiple candidates, explicit choices, suppression,
      echoes, receipts, replay, late order, and provider failure.
- [ ] Verified-Neon/provider-fake acceptance covers direct inbound continuation,
      new Request, incorrect candidate rejection, mixed timeline, central/multi-
      Store routing, policy revocation, and atomic cleanup.
- [ ] Brain provider, privacy, schema, API, permission, feature, reporting, and
      task docs state the exact supported observation boundary.

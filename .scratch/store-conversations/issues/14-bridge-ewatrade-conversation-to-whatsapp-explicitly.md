# 14 — Bridge An EwaTrade Conversation To WhatsApp Explicitly

**What to build:** Let an eligible customer intentionally continue an EwaTrade
Store Conversation in WhatsApp through a short-lived bridge code that must be
sent back through a verified inbound webhook before identities are connected.

**Blocked by:** 03 — Support Multiple Typed Requests In One Store Conversation; 11 — Offer Optional Account Adoption And Explicit Guest Linking; 13 — Configure EwaTrade Chat, WhatsApp, Or Both In Customer Channels

**Status:** ready-for-agent

- [ ] Eligible `Continue on WhatsApp`/`Reach the Store faster` actions issue a
      random one-time bridge capability bound to Tenant, Store, Conversation,
      current Guest Identity/account, intended operation, and active Connection.
- [ ] Only a digest, lifecycle, expiry, and safe scope facts persist; bridge URLs,
      prefilled messages, logs, and analytics contain no prescription, Request,
      Quote, customer, or internal identifiers.
- [ ] CTA click records only an EwaTrade navigation event and never marks
      WhatsApp opened, arrived, linked, delivered, or read.
- [ ] A current signed provider webhook carrying the exact customer-sent code is
      required to consume the capability and establish one Store-scoped Channel
      Bridge.
- [ ] Expired, replayed, revoked, altered, wrong-Connection, wrong-recipient,
      wrong-Store, cross-Tenant, and ambiguous bridge messages fail before
      content/identity persistence or Request continuation.
- [ ] After linking, WhatsApp offers deterministic `Continue where I stopped` and
      `Start a new request` choices when both are valid; only explicit choice
      routes later content.
- [ ] Continued content attaches to the exact current typed Request, while new
      Request choice reuses the typed intake dispatcher and never creates a
      universal Request.
- [ ] The web/mobile timeline reflects bridge and subsequent supported messages
      with truthful channel attribution and safe recovery if provider delivery
      fails.
- [ ] Mode/policy/readiness/Store binding is rechecked at bridge issue, inbound
      consume, Request choice, message persist, notification claim, and provider
      send.
- [ ] Nigeria Pharmacy WhatsApp cannot issue or consume a bridge without current
      explicit approval; a stale earlier capability fails closed after policy
      changes.
- [ ] Focused signature, replay, routing, policy, credential rotation, provider
      failure, and concurrency tests prove exact one-time linking.
- [ ] Verified-database/provider-fake acceptance proves web-to-WhatsApp bridge,
      continue/new choice, cross-Tenant/Store isolation, rollback/retry, and
      run-owned cleanup.
- [ ] Brain channel, communications, API, permission, schema, privacy, feature,
      and task docs state that customer-sent inbound—not app open—proves arrival.

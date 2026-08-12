# 02 — Deliver The First Anonymous Store Conversation Text Loop

**What to build:** Let a customer scan a Store QR, receive a device-scoped Guest
Identity, send a text Product/Commerce Inquiry, and receive a human Store reply
in one persistent web conversation. A Store attendant can claim the new queue
item and answer, and the same browser can reload the complete safe timeline
without signup.

**Blocked by:** 01 — Preserve Store QR Entry On The Shared Chat Host

**Status:** ready-for-agent

- [ ] A permitted Store Entry bootstraps or resumes one opaque Guest Identity
      through a Secure, HttpOnly, SameSite device credential; no script-readable
      bearer is stored in browser local storage.
- [ ] One Guest Identity has at most one active Store Conversation for the exact
      Store, and the same guest across another Store or Tenant remains isolated.
- [ ] The customer sends a text Product/Commerce Inquiry using payload-bound
      idempotency and receives one accepted message and one authoritative typed
      source under retries or concurrent duplicate submission.
- [ ] Messages are append-only, receive a deterministic conversation sequence
      and authoritative occurrence time, and are returned through bounded cursor
      pagination rather than mutable timestamps alone.
- [ ] A Store-scoped queue exposes a safe new-conversation summary to active
      eligible attendants without message content or private identifiers in
      unrelated list projections.
- [ ] One eligible attendant claims primary responsibility and sends a Store
      reply; an unassigned, suspended, removed, foreign-Store, or stale actor
      cannot read or reply.
- [ ] The customer reloads the shared-host page and sees the original request,
      Store reply, safe sender identity, channel attribution, and current state.
- [ ] Customer and staff messages use separate public/internal projections;
      internal notes, credentials, provider ids, audit detail, and raw errors
      never enter the customer timeline.
- [ ] Expired/revoked guest credentials, restricted conversations, stale entry
      context, and storage failures expose typed safe recovery and make no
      partial message/request writes.
- [ ] Verified-database/API acceptance proves QR-to-guest-to-message-to-claim-
      reply-to-reload, duplicate safety, cross-Tenant/Store denial, and atomic
      run-owned fixture cleanup.
- [ ] Responsive browser acceptance covers empty/loading/error/retry, composer
      send states, timeline reload, keyboard navigation, focus, and mobile
      overflow containment.
- [ ] Brain schema, relationship, API, permission, feature, migration, and task
      records reflect the additive first tracer without overstating later media,
      mobile, realtime, account, or WhatsApp behavior.

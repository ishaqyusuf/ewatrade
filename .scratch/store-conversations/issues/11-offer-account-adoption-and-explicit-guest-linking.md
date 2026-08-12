# 11 — Offer Optional Account Adoption And Explicit Guest Linking

**What to build:** Invite a guest to sign up or sign in at a meaningful
milestone without blocking the current journey, then explicitly link only the
Store Conversations proven by the current guest credential so the customer can
gain cross-device history and manage authorized guest devices safely.

**Blocked by:** 05 — Add The Mobile Customer Shell And Universal Store Links; 10 — Render Quotes And Customer Actions Inside The Timeline

**Status:** ready-for-agent

- [ ] The first released Quote may append one optional Account Invitation message
      without obscuring or disabling Quote, payment, clarification, booking, or
      fulfilment actions.
- [ ] Dismissal is persisted by conversation/milestone and does not repeat
      aggressively; guests retain every otherwise permitted customer action.
- [ ] Web and mobile authentication return safely to the originating Customer
      shell/conversation without mixing business onboarding or losing guest
      access on cancel/failure.
- [ ] After authentication, the server lists only conversations authorized by
      the current Guest Identity credential; matching email/phone never performs
      discovery or historical merge.
- [ ] `Link these conversations` is explicit, confirmed, payload-bound,
      idempotent, and appends immutable actor/account/guest/conversation/Store/
      purpose/outcome audit without message content.
- [ ] A successful link enables authenticated cross-device conversation access
      while retaining the current guest device until the customer removes it.
- [ ] Account security lists safe linked-device facts and can revoke one device
      without deleting the account, conversation, typed Requests, or other
      authorized devices.
- [ ] A conversation already linked to another account, account/Store conflict,
      stale/expired guest credential, replay with altered payload, or partial
      failure fails closed into bounded recovery and never reassigns ownership.
- [ ] Customer Account identity remains distinct from a Tenant's saved Customer
      directory; no implicit Tenant-customer association is created.
- [ ] Focused security/concurrency tests cover invitation replay, auth return,
      exact enumeration, link conflict, concurrent link, device removal,
      cross-Tenant/Store denial, and no contact-based discovery.
- [ ] Verified-database plus web/native acceptance proves guest continuation,
      dismiss, signup/signin, explicit review/link, another authenticated device,
      revoked guest device, and conflict recovery with fixture cleanup.
- [ ] Brain auth, schema, relationship, API, permission, privacy, feature, and
      task records describe explicit linking and separate identity contexts.

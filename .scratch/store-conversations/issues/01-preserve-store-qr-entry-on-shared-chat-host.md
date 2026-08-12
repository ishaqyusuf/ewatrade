# 01 — Preserve Store QR Entry On The Shared Chat Host

**What to build:** Preserve every published Store QR and opaque Store Entry Link
while making `chat.ewatrade.com` the canonical customer-conversation host. The
new host must initially reproduce the Store's current safe request/WhatsApp
choices, branding, policy denial, and recovery behavior so the compatibility
seam can ship before conversation persistence changes customer behavior.

**Blocked by:** None — can start immediately

**Status:** complete

- [x] An existing valid Store Entry token resolves the same Tenant, Store,
      request kinds, allowed actions, and safe Store presentation on the shared
      chat host without exposing internal identifiers.
- [x] Existing printed QR codes remain valid; ordinary mode, attendant,
      Connection, credential, or provider changes do not require reprinting.
- [x] Revoked, malformed, unpublished, foreign, and ambiguous entry tokens fail
      before creating customer, conversation, request, media, or provider data.
- [x] The compatibility page presents current online-request and WhatsApp
      choices exactly as permitted today, including safe unavailable and retry
      states, without claiming Store Conversations exist yet.
- [x] Existing public entry/request URLs remain compatible through safe redirect
      or adapter behavior, including browser Back/Forward and direct reload.
- [x] Store branding uses only an allowlisted customer-safe projection and
      cannot inject scripts, arbitrary HTML, remote tracking, or unsafe styles.
- [x] Local development and deployment routing can resolve the shared host
      without changing the authenticated dashboard host or business storefront
      subdomain boundary.
- [x] Desktop and compact-mobile browser acceptance covers valid, revoked,
      unavailable, online-request, and policy-permitted WhatsApp states with no
      console errors or page-level overflow.
- [x] Focused tests prove token digest handling, Tenant/Store isolation,
      compatibility projection, replay, revocation, and no write on rejection.
- [x] Brain feature, API, permission, and architecture records describe the
      compatibility-only shared-host expansion without claiming conversation
      implementation or production traffic switch.

## Evidence

- The focused contract, routing, and repository matrix passed 29 tests / 78
  assertions for the chat-host URL,
  exact host classification, Portless environment contract, digest-backed entry
  resolution, Tenant/Store isolation, revocation, and no-write rejection.
- Run-owned verified-Neon browser fixtures passed at 1280x720 and 390x844 for
  valid web entry, policy-permitted WhatsApp, unavailable configuration,
  malformed and revoked tokens, direct reload, and browser Back/Forward. The
  compact page reported zero horizontal overflow and no application console
  errors; the existing pg SSL-mode deprecation warning remained development
  infrastructure output rather than a customer-page failure.
- Both run-owned fixture Tenants reported exact cleanup completion. No provider,
  production traffic, migration, switch, or contraction action was performed.

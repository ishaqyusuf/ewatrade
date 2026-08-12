# 12 — Notify Customers About Unread Responses And Store Reopening

**What to build:** Notify eligible customers when a Store response remains
unread after the approved grace period or when a paused Store becomes available,
using verified guest contacts or account preferences while keeping every
external message neutral, consented, policy-safe, idempotent, and recoverable.

**Blocked by:** 08 — Deliver Realtime Messages, Read State, And Foreground Alerts; 09 — Control Store Conversation Availability And Manual Pause; 11 — Offer Optional Account Adoption And Explicit Guest Linking

**Status:** ready-for-agent

- [ ] Guests may verify an email or phone as a Guest Notification Contact without
      creating an account or granting marketing consent; verification is
      expiring, single-use, rate-limited, digest-only, and purpose-bound.
- [ ] Signed-in customers manage eligible conversation notification preferences
      separately from business/member settings and marketing preferences.
- [ ] A Store response schedules one durable unread check at a 45-second default;
      Store configuration may select only 30 through 60 seconds.
- [ ] Claim rechecks current read watermark, message visibility, conversation/
      device/account access, verification, consent, preference, suppression,
      Tenant/Store, policy, and provider readiness before sending.
- [ ] Read-before-claim cancels external delivery; several unread responses in a
      bounded period coalesce into one notification; retry/replay sends at most
      one provider message per intent/effect.
- [ ] In-app/native/web push is preferred where registered and eligible; verified
      email or policy-permitted WhatsApp follows customer preference and current
      provider capability.
- [ ] Every notification is neutral, for example `You have a new response from
      <Store>`, and includes no prescription, medicine, diagnosis, attachment,
      Quote amount, payment, or other sensitive content.
- [ ] `Notify me when available` creates a separate idempotent intent and sends
      only after an actual server-owned unavailable-to-available transition and
      current consent recheck.
- [ ] Delivery attempts/receipts, bounded retry, terminal failure, invalid
      destination, preference change, verification expiry, Store pause, and
      provider outage expose safe recovery without blocking conversation truth.
- [ ] Identifier-only jobs never contain contact destinations or message
      content; decryption/provider rendering occurs only after scoped claim.
- [ ] Deterministic provider tests and verified-database acceptance cover unread,
      read cancellation, coalescing, email/push, policy-denied WhatsApp,
      availability reopening, replay, and cross-scope denial.
- [ ] Web/native preference and verification acceptance covers optional consent,
      errors/retry, expiry, unsubscribe, Account Invitation interplay, and
      accessible status.
- [ ] Brain communications, privacy, API, permission, feature, provider-cost,
      and task docs record neutral content and current-policy reauthorization.

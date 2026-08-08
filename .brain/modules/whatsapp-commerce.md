
# WhatsApp Commerce

WhatsApp acts as a commerce communication channel.

Capabilities:

- send order updates
- convert chats into orders
- AI reply assistant
- customer messaging history

## Prescription Commerce Boundary

- Independent pharmacies or pharmacy groups own their WhatsApp Business
  Accounts and public business numbers.
- The initial adapter uses direct Meta WhatsApp Cloud API behind the
  provider-neutral Communications boundary. Midday's one global sender is a
  transport reference, not EwaTrade's Tenant model, and Twilio is not required.
- One EwaTrade Meta application and verified webhook surface resolves the
  recipient provider phone-number id to one Tenant-owned WhatsApp Connection
  before Store, customer, or request lookup.
- Store channels bind to reusable Tenant connections. Central group numbers
  require bounded Store context or explicit customer selection; ambiguous and
  cross-Tenant routing fails closed.
- Redis conversation state is keyed by Connection, customer WhatsApp id, and
  explicit Store context. A separate short-lived routing selection contains
  only Tenant/Store identity so central-number follow-up media can reach the
  selected Store while each pharmacy request thread remains isolated.
- Quick actions resolve pickup or delivery before `Review & pay` whenever
  fulfilment changes the payable total. Buttons never establish payment.
- Manual and Embedded Signup both create a pending Store binding, then run an
  identifier-only readiness job. Existing active routing remains authoritative
  until a replacement passes. Credential rotation follows the same staged
  promotion rule.
- Embedded Signup callback state and discovered-number selection are encrypted,
  short-lived, and server-side. Owners explicitly choose the number and a
  consented test recipient; the callback never auto-selects a number.
- Operational alerts for unknown, inactive, duplicate, or ambiguous inbound
  traffic store identifiers/digests only and exclude message content.
- Usage and delivery receipts are metered per Connection and Store. Meta fees,
  any future BSP markup, and EwaTrade support/subscription charges remain
  separate cost dimensions; no volatile provider price is a domain constant.
- Meta `sent`, `delivered`, `read`, and `failed` status webhooks are normalized
  separately from inbound messages and update only the matching
  Connection/Tenant communication attempt. Updates are row-locked and
  monotonic so a delayed lower-rank receipt cannot regress delivery state or
  overwrite the original read timestamp.

See
`.brain/decisions/ADR-0027-tenant-owned-multi-pharmacy-whatsapp-connections.md`.

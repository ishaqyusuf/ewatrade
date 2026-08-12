# ADR-0034: Anonymous Store Conversations And Customer Shell

## Status

Accepted on 2026-08-12 after owner approval of the Wayfinder, consolidated
specification, and dependency-ordered 18-ticket source batch. This accepts the
product and architecture direction; implementation, migration, provider,
production, switch, and contraction authority remain separate.

## Context

EwaTrade's public Store entry currently projects separate online-request and
WhatsApp choices. Pharmacy WhatsApp in Nigeria remains restricted under the
current policy position, and a channel selector does not provide the durable,
accountless continuity customers need for prescriptions, product questions,
Quotes, payment, and Store responses.

The existing mobile application starts as an authenticated business-operations
surface. Forcing a customer who scans a Store QR through that onboarding would
recreate the same friction. Creating a second application would duplicate
delivery, identity, actions, media, and navigation infrastructure.

Customer chat also cannot become a universal Request or clinical workflow.
Existing Prescription, Service, Commerce, Quote, payment, fulfilment,
Customer Channels, and private-media boundaries already own authoritative
behavior that the conversation should present rather than replace.

## Decision

- EwaTrade will introduce a Store-scoped `Store Conversation` presentation and
  messaging aggregate. One conversation may link multiple typed Requests, but
  does not own their clinical, commercial, work, or fulfilment truth.
- Stable opaque Store Entry Links use the shared
  `https://chat.ewatrade.com/r/<token>` host rather than business or Pharmacy
  conversation subdomains.
- Store Entry Links are iOS Universal Links and Android App Links. They open an
  isolated unauthenticated-capable Customer shell in the existing EwaTrade app
  when installed and the full web experience otherwise.
- Customer and Business mobile shells use separate navigation and security
  contexts. Guest conversation authority can never grant business operations
  access.
- Accountless continuity uses a device-scoped Guest Identity with server-owned
  digest credentials. A browser, installation, phone, email, or IP address is
  not proof of a person.
- Guest-to-account linking is explicit, capability-proven, audited, and
  conflict-safe. Contact similarity never merges historical conversations.
- Store responses remain human-led. Deterministic system and Action Messages
  may present current server-authorized lifecycle actions; autonomous
  customer-facing AI and professional/commercial authority are excluded.
- Customer Channels owns Store Conversation Mode (`EwaTrade Chat`, `WhatsApp`,
  or `Both`), availability configuration, team routing, Store Entry publication,
  provider readiness, and policy gates.
- A WhatsApp Channel Bridge requires a customer-sent opaque bridge message or
  explicit confirmation of a verified Store-scoped candidate. A CTA click,
  application open, or phone-number match never links identities.
- Mixed timelines show only supported provider messages EwaTrade actually
  observes and label their channel. Complete WhatsApp history synchronization
  is not promised.
- Nigeria Pharmacy WhatsApp remains default-prohibited without a future current
  written approval. Store configuration cannot override policy.
- Implementation follows expand-contract and preserves existing public Request,
  Pharmacy, Quote, action, media, and notification compatibility until
  separately approved switch and contraction.

## Consequences

- Customers can send private requests and return for responses without signup.
- Account signup becomes a contextual value proposition rather than an intake
  gate.
- The existing mobile binary can serve customers without mixing customer and
  merchant authority.
- Conversation persistence, guest credentials, realtime/read state, queue
  assignment, account linking, voice media, and bridge state require additive
  contracts and migration.
- Typed source aggregates and professional Pharmacy controls remain explicit.
- WhatsApp remains a policy-gated adapter instead of the conversation owner.
- Store-level compatibility, browser/native acceptance, privacy, live provider,
  migration, rollout, rollback, and later contraction remain mandatory gates.

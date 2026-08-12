# Anonymous Store Conversations

## Status

The specification and dependency-ordered 18-ticket implementation batch were
owner-approved on 2026-08-12. Ticket 01 is complete: newly published links use
the shared chat-host contract while existing entry URLs remain compatible, and
run-owned desktop/compact browser acceptance proves current web, WhatsApp,
unavailable, invalid, and revoked states without page-level overflow. Ticket 02
is the implementation frontier. No conversation persistence is complete yet,
and no provider, production traffic-switch, or contraction is authorized by
this status.

## Purpose

Anonymous Store Conversations replace the public web-versus-WhatsApp selector
with a Store-scoped, human-led EwaTrade conversation on
`chat.ewatrade.com`. Customers may submit private text, images, documents, and
voice notes without registration, return through a device-scoped Guest
Identity, receive Store replies and structured actions, and optionally link
their history to a Customer Account later.

The same Store Entry Link opens an isolated Customer shell in the existing
mobile app when installed and the complete web experience otherwise. The
Business shell remains a separate authenticated security context.

## Product Boundary

- One Store Conversation belongs to exactly one Tenant and Store.
- A conversation may present multiple typed `PrescriptionRequest`,
  `ServiceRequest`, or Commerce Inquiry sources without replacing them.
- Quotes, selectable options, payments, booking, pickup, delivery, and other
  customer actions continue through current server-owned capabilities.
- Store replies are human-led. Deterministic system/action messages are
  permitted; autonomous customer-facing AI and clinical/commercial authority
  are excluded.
- Guest access is device-scoped. Account linking is explicit and never inferred
  from email or phone similarity.
- Store Conversation Availability derives from hours, eligible team coverage,
  policy, and manual pause rather than staff browser presence.
- Stores may configure EwaTrade Chat, WhatsApp, or Both only when current
  policy and provider readiness permit the effective mode.
- Mixed timelines include only messages EwaTrade actually observes. WhatsApp
  opens and arbitrary history synchronization are never claimed.
- Nigeria Pharmacy WhatsApp remains fail closed without future written policy
  approval.

## Customer Experience

- QR: `https://chat.ewatrade.com/r/<opaque-token>`.
- Web uses a Secure, HttpOnly device credential; mobile uses secure device
  storage.
- The composer uses `+`, multiline text, and microphone/Send states.
- Images, PDFs/documents, and bounded voice notes use private-media controls.
- Quotes and lifecycle facts render as structured messages with reauthorized
  actions.
- The first released Quote may show an optional Account Invitation.
- Unavailable Stores keep history readable, disable submission, preserve local
  drafts, and offer `Notify me when available`.
- Unread responses schedule a neutral external notification after a 45-second
  default grace period, bounded to 30–60 seconds and rechecked before send.

## Store Experience

- A shared Store queue exposes safe conversation summaries.
- One eligible attendant claims primary responsibility before replying.
- Reassignment and handoff are audited; membership removal immediately revokes
  access and assignment eligibility.
- Attendant assignment, pharmacist clinical release, and commercial Quote
  approval remain independent.
- Customer Channels owns mode, availability configuration, Store team routing,
  QR publication, policy/readiness, and recovery.

## Specification And Decision

- [Implementation-ready specification](../../.scratch/wayfinder-store-conversations/spec.md)
- [Wayfinder map](../../.scratch/wayfinder-store-conversations/map.md)
- [Owner-approved implementation tickets](../../.scratch/store-conversations/issues/)
- [ADR-0034](../decisions/ADR-0034-anonymous-store-conversations-and-customer-shell.md)

## Approved Testing Seams

1. Authoritative Store Conversation lifecycle across Guest Identity, typed
   Requests, Store replies, actions, account linking, and concurrency.
2. Channel and notification lifecycle across EwaTrade Chat, WhatsApp bridging,
   availability, unread grace, preferences, replay, and policy denial.
3. Private-media lifecycle across image, document, and voice-note intake while
   preserving Pharmacy clinical authority.
4. Cross-platform web, mobile Customer shell, and Store dashboard acceptance.

## Implementation Frontier

- Implement Ticket 02's first anonymous text loop on the stable opaque Store
  Entry Link and shared `chat.ewatrade.com` host.
- Execute Tickets 03–18 only after their recorded blockers are complete.
- Keep additive implementation, compatibility acceptance, provider and
  production gates as separately authorized work.

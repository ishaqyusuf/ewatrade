# Wayfinder: Anonymous Store Conversations Across Web And Mobile

Label: `wayfinder:map`

## Destination

Produce an approved, implementation-ready product and architecture
specification for an anonymous, Store-scoped EwaTrade conversation experience
on `chat.ewatrade.com` and in the existing mobile app. It must support private
prescription and ordinary-business requests, human Store replies, structured
customer actions, guest continuity, optional account linking, unread-response
notifications, team routing, and policy-gated WhatsApp bridging without
weakening existing typed Request, Quote, payment, fulfilment, or Pharmacy
controls.

## Notes

- Planning only. Resolve decisions and prepare the specification handoff; do
  not implement schema, API, dashboard, storefront, mobile, provider, migration,
  or production changes while working this map.
- Use `/grilling` and `/domain-modeling` for product and language decisions.
  Keep [EwaTrade Commerce](../../CONTEXT.md) current as terms resolve.
- Use `/prototype` for the customer conversation and Store inbox tickets. The
  prototypes are disposable decision aids, not production UI.
- Preserve Service Commerce, `PrescriptionRequest`, `ServiceRequest`, and
  Commerce Inquiry authority. A Store Conversation may present several typed
  Requests but is not a universal Request or workflow aggregate.
- Standing decision: one Guest Identity or Customer Account has one continuing
  Store Conversation per Store. Multiple Requests remain independently
  governed inside the customer-visible timeline.
- Standing decision: Store QR codes use stable opaque entry links on
  `https://chat.ewatrade.com/r/<token>`. The token resolves Store, branding,
  configuration, availability, and permitted actions without exposing business,
  Store, conversation, provider, or customer identifiers.
- Standing decision: the same HTTPS entry link is an iOS Universal Link and
  Android App Link. It opens the isolated Customer shell when the existing
  EwaTrade app is installed and the full web experience otherwise. A
  short-lived Conversation Transfer may continue a web Guest Identity in the
  app without signup.
- Standing decision: Guest Identity is device-scoped. Web uses a signed secure
  cookie reference and mobile uses secure device storage. Cross-device history
  requires explicit account linking or another deliberately verified recovery
  mechanism.
- Standing decision: signup/signin is optional. Meaningful milestones may show
  an Account Invitation as a conversation message, and linking is explicit,
  capability-proven, audited, idempotent, and never inferred from matching
  email or phone alone.
- Standing decision: the first experience is human-led. Deterministic lifecycle
  messages and server-authorized Action Messages are allowed; autonomous
  customer-facing AI, clinical interpretation, substitution, pricing, Quote
  release, or availability promises are not.
- Standing decision: Action Messages may expose current actions such as Quote
  option selection, payment, fulfilment choice, or asking the Store. Every
  command must reauthorize current state, policy, expiry, Store, and target.
- Standing decision: the composer supports text, private image/document
  attachments, and bounded private voice notes. Voice does not replace a
  required prescription artifact and has no automatic transcription in the
  first release.
- Standing decision: Store Conversation Availability is server-owned from
  service hours, eligible team coverage, vertical policy, and manual pause—not
  browser presence. Unavailable conversations stay readable, disable new
  submission, preserve local drafts, and offer `Notify me when available`.
- Standing decision: Stores may choose EwaTrade Chat, WhatsApp, or Both only
  when current policy and provider readiness allow it. History survives mode
  changes. Nigeria Pharmacy WhatsApp remains unavailable without future written
  approval; category recommendations never authorize a channel.
- Standing decision: a Channel Bridge requires explicit customer confirmation.
  A WhatsApp CTA click or app open is observable only on EwaTrade; the first
  inbound provider message proves arrival. Direct WhatsApp messages may receive
  a Store-scoped recent-conversation candidate prompt only after a verified
  account phone or Guest Notification Contact match, and never auto-merge.
- Standing decision: the mixed timeline shows only channel messages EwaTrade
  actually observes through supported provider contracts, labels their channel,
  and never claims complete WhatsApp synchronization.
- Standing decision: immediate in-app delivery is followed by an external
  unread notification after a 30–60 second grace period. Account preferences or
  an optional verified Guest Notification Contact select permitted channels;
  notification content is neutral and contains no prescription or health data.
- Standing decision: new conversations enter a Store team queue with one
  primary attendant, guarded concurrent replies, audited handoff, and immediate
  membership revocation. Attendant assignment, pharmacist authority, and
  commercial Quote approval remain independent.
- Standing decision: one EwaTrade mobile binary contains isolated Customer and
  Business shells. Store links bypass business onboarding, the customer shell
  resumes the last active conversation and exposes a conversation list, and
  customer guest credentials never grant business access.

## Decisions so far

No child ticket has been resolved yet. The standing decisions above are the
owner-approved inputs used to chart this map.

The owner then invoked direct `/to-spec` synthesis. The
[consolidated specification](spec.md) is labelled `ready-for-agent` for owner
review and later ticket decomposition. Open child tickets remain an explicit
review/investigation checklist; direct synthesis does not falsely mark them
resolved.

## Not yet specified

- Exact privacy, consent, recovery, and retention periods until the guest
  identity and regulated-media investigation establishes the lawful boundary.
- Exact realtime transport, event persistence, notification scheduling, and
  offline replay shape until current architecture and delivery guarantees are
  audited.
- Whether Meta Business App coexistence can safely contribute supported message
  echoes or historical imports; the mixed timeline must remain honest if it
  cannot.
- Final customer wording, Store branding limits, accessibility behavior, and
  milestone timing until the customer and staff prototypes are reviewed.
- Exact expand-contract and rollout sequence until current public routes,
  Pharmacy compatibility, Customer Channels, mobile routing, and production
  gates are inventoried.

## Out of scope

- Implementing production code, migrations, deployment, or provider operations
  inside this Wayfinder map.
- Automatically enabling or disguising Pharmacy WhatsApp where Meta policy does
  not permit it.
- Claiming that EwaTrade can observe a WhatsApp application open or synchronize
  arbitrary WhatsApp history.
- Autonomous customer-facing AI, diagnosis, medicine recommendation,
  substitution, pharmacist replacement, or automatic Quote release.
- A separate customer mobile application.
- Marketplace discovery, broad catalog browsing, and the planned semi-commerce
  exploration surface; the customer shell may reserve room for them later.
- Replacing typed Request aggregates with one universal Request or arbitrary
  workflow engine.
- Production live-provider canaries, policy clearance, migration reconciliation,
  traffic switch, or legacy contraction.

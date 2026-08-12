# Anonymous Store Conversations Across Web And Mobile

Label: `ready-for-agent`

Status: specification ready for implementation-ticket decomposition

## Problem Statement

Customers who scan a Store QR code currently encounter separate request forms
or a web-versus-WhatsApp channel choice. That experience adds friction for a
customer who simply wants to send a prescription, product photo, document,
voice note, or question and then return later to see the Store's response.

Pharmacy customers are particularly sensitive to this friction. They should not
need to create an account before submitting a prescription, but they still need
private continuity, clear Store availability, professional review, an exact
Quote, safe payment and fulfilment actions, and a dependable way to learn that
the Store replied. A device cookie cannot safely be treated as proof of a
person, and a phone-number match must not silently merge private conversations.

The existing mobile application is primarily a business-operations product.
Opening a Store QR code must not force a customer through business onboarding
or login. At the same time, EwaTrade should not create a separate customer app
or duplicate Request, Quote, payment, fulfilment, media, notification, and
Pharmacy logic.

WhatsApp may remain useful for eligible Stores, but EwaTrade cannot observe a
customer merely opening WhatsApp, cannot promise complete WhatsApp history
synchronization, and cannot enable a restricted Pharmacy channel merely because
a Store selected it. Cross-channel continuity therefore needs explicit customer
confirmation, truthful provider facts, and current policy/readiness checks.

The product needs one generic, Store-scoped conversation layer that feels as
immediate as a modern chat application while retaining typed Request authority,
human Store responsibility, regulated Pharmacy controls, optional account
adoption, and strict Tenant/Store isolation.

## Solution

Every published Store receives a stable opaque Store Entry Link on
`chat.ewatrade.com`. Scanning the Store QR opens that exact Store's branded
conversation. If the EwaTrade app is installed, the same HTTPS link opens the
Customer shell through an iOS Universal Link or Android App Link. Otherwise it
opens the complete responsive web experience. Neither path requires signup or
login.

The server creates or resumes a device-scoped Guest Identity. A Guest Identity
may have one continuing Store Conversation with each Store. The conversation
can present several Prescription Requests, Service Requests, or Commerce
Inquiries over time, but those typed Requests retain their independent clinical,
commercial, operational, Quote, payment, and fulfilment lifecycles.

The conversation is human-led. Customers send text, private images,
documents/PDFs, and bounded voice notes. Store attendants receive messages in a
shared queue, one eligible attendant claims primary responsibility, and
reassignment is audited. A pharmacist may also be an attendant, but clinical
release, conversation assignment, and commercial Quote approval remain
independent authorities.

Deterministic system messages and Action Messages place current Quote choices,
payment, pickup, delivery, booking, cancellation, reschedule, and human-help
actions directly in the timeline. These messages never become a second source
of truth: every action command revalidates its exact target, current version,
expiry, policy, Store, readiness, and lifecycle before producing an effect.

At meaningful milestones, especially after a Quote is released, an optional
Account Invitation appears like a chat message. The customer may continue as a
guest. If they sign in or register, EwaTrade explicitly asks whether to link the
currently authorized guest conversations. Email or phone similarity alone never
causes a historical merge.

Store Conversation Availability is derived on the server from configured
service hours, eligible team coverage, vertical policy, and manual pause state.
When unavailable, history and current actions remain readable, the composer is
disabled, drafts stay local, and the customer may request a neutral availability
notification.

A Store may select EwaTrade Chat, WhatsApp, or Both only when the relevant
channel is currently permitted and ready. WhatsApp-only mode keeps EwaTrade
history readable and replaces the composer with `Continue on WhatsApp`. Both
mode keeps the composer and adds a secondary `Reach the Store faster on
WhatsApp` action. A short-lived bridge code must be sent by the customer before
the WhatsApp identity can be connected to a web conversation. A direct inbound
WhatsApp message may prompt the customer about a recent Store-scoped candidate
only when a verified account phone or Guest Notification Contact supports the
candidate; explicit `Continue` remains mandatory.

All web, mobile, and supported provider messages actually observed by EwaTrade
may appear in one channel-labelled timeline. EwaTrade never fabricates missing
provider history. Nigeria Pharmacy WhatsApp remains fail closed without future
written policy approval.

New Store responses arrive in realtime while a customer is active. If a
response remains unread after a server-owned grace period—45 seconds by
default, configurable only within 30–60 seconds—EwaTrade rechecks current read
state, consent, preferences, contact verification, policy, and provider
readiness before sending one neutral external notification. No notification
contains prescription, medicine, diagnosis, price, or other sensitive content.

## User Stories

1. As a customer, I want to scan one Store QR code, so that I reach the correct Store without choosing a business or branch again.
2. As a customer, I want the QR to open `chat.ewatrade.com`, so that I recognize one consistent EwaTrade conversation surface.
3. As a customer, I want the Store name, avatar, and approved branding to load from current Store configuration, so that I know who I am contacting.
4. As a customer, I want to start without registering, so that urgent or simple requests have minimal friction.
5. As a customer, I want the same browser to remember my Store Conversation, so that I can return to the Store's response.
6. As a customer, I want the mobile app to remember my last Store Conversation, so that reopening the app returns me to useful context.
7. As a customer, I want Back in the Customer shell to show my conversation list, so that I can revisit other Stores.
8. As a customer, I want a Store Entry Link to open the installed app directly, so that I avoid unnecessary browser steps.
9. As a customer without the app, I want the same link to provide the complete web experience, so that installation is optional.
10. As a web customer, I want an optional `Open in EwaTrade app` action, so that I can continue the current guest conversation in the app.
11. As a customer, I want conversation transfer to omit private content from the URL, so that links and logs do not expose my request.
12. As a customer, I want a failed or expired transfer to leave my web conversation usable, so that app handoff never strands me.
13. As a customer, I want to send text messages, so that I can explain what I need naturally.
14. As a customer, I want the `+` button to show only currently permitted attachment types, so that unsupported choices are not offered.
15. As a customer, I want to attach an image, so that I can send a prescription or show a product.
16. As a customer, I want to attach a PDF or document, so that multi-page prescriptions or supporting documents remain usable.
17. As a customer, I want to record a bounded voice note, so that I can clarify a request when typing is inconvenient.
18. As a customer, I want recording duration, cancel, preview, and send controls, so that I do not submit an unintended recording.
19. As a customer, I want the microphone to change to Send when text or an attachment exists, so that the composer behaves predictably.
20. As a customer, I want failed uploads to expose safe retry or removal, so that I can recover without resending the whole request.
21. As a Pharmacy customer, I want a prescription image or document to create a Prescription Request automatically when that intent is unambiguous, so that no separate form blocks submission.
22. As a customer of a multi-capability Store, I want a short in-chat intent choice when my first message is ambiguous, so that it reaches the correct typed Request.
23. As a returning customer, I want one Store Conversation to contain several Requests over time, so that the chat remains familiar.
24. As a returning customer, I want clear Request separators and status cards, so that an old Quote is not confused with a new request.
25. As a customer with several active Requests, I want to select which Request a new message concerns, so that private and commercial facts are not misattributed.
26. As a customer, I want completing one Request to preserve the Store Conversation, so that I can return later.
27. As a customer, I want old sent messages to remain immutable, so that Store replies and commercial history cannot be silently rewritten.
28. As a customer, I want corrections to appear as new messages, so that the conversation remains auditable.
29. As a customer, I want a clear accepted/sent state after submission, so that I know EwaTrade received my message.
30. As a customer, I want a foreground sound or visual notification when a Store response arrives, so that I notice it while the conversation is open.
31. As a customer, I want foreground sound to respect device/browser permission and accessibility preferences, so that the experience is not intrusive.
32. As a customer, I want my read state to stop pending external reminders, so that I am not notified after already reading the response.
33. As a customer, I want an unread response notification after a short grace period, so that I can safely leave the page.
34. As a guest, I want to verify an email address or phone number solely for request notifications, so that signup remains optional.
35. As a signed-in customer, I want account notification preferences to control eligible channels, so that I receive messages where I prefer.
36. As a Pharmacy customer, I want external notification text to remain neutral, so that health information is not exposed on a lock screen or shared inbox.
37. As a customer without a verified destination or consent, I want the system to remain in-app only, so that EwaTrade does not contact me unexpectedly.
38. As a customer, I want repeated unread replies to be coalesced into a bounded notification, so that I am not spammed.
39. As a customer, I want a Quote to appear as a structured message, so that price and available choices are easy to understand.
40. As a customer, I want mutually exclusive Quote options to remain separately selectable, so that alternatives are not added into one incorrect payable total.
41. As a customer, I want to choose an exact Quote option from the conversation, so that my commercial choice is explicit.
42. As a customer, I want a `Pay now` action only when the current selected Quote is payable, so that I cannot pay a stale or incomplete amount.
43. As a customer, I want pickup and delivery actions to show only when currently allowed, so that I do not select an unavailable fulfilment path.
44. As a customer, I want booking, reschedule, cancellation, and human-help actions to appear only when relevant, so that the timeline is not cluttered.
45. As a customer, I want completed, expired, rejected, or superseded actions to render honestly, so that an old button does not appear usable.
46. As a customer, I want every action to recheck current state, so that a stale screen cannot create an invalid payment, booking, or Order.
47. As a customer, I want a payment confirmation message only after authoritative provider reconciliation, so that navigation is not mistaken for payment.
48. As a customer, I want meaningful milestones to offer optional signup or signin, so that I understand the value of an account at the right moment.
49. As a guest, I want to dismiss an Account Invitation and continue, so that authentication never blocks the current journey.
50. As a newly signed-in customer, I want to review the exact guest conversations that can be linked, so that I control the merge.
51. As a customer, I want guest-to-account linking to use current guest authorization rather than contact matching, so that another person's history is not attached to me.
52. As a customer, I want an already-linked or conflicting conversation to fail closed into recovery, so that ownership is not silently reassigned.
53. As a customer, I want linked history on my other authenticated devices, so that account adoption provides durable cross-device value.
54. As a customer, I want to remove a previously linked guest device, so that a lost or shared device no longer has access.
55. As a customer, I want Store availability shown before I compose, so that I know whether the Store is accepting messages.
56. As a customer, I want the composer disabled when the Store is unavailable, so that I do not expect an unattended response.
57. As a customer, I want my unsent draft preserved locally during unavailability, so that my work is not lost.
58. As a customer, I want an expected reopening time when the Store has a known schedule, so that I know when to return.
59. As a customer, I want `Notify me when available`, so that I do not repeatedly check the page.
60. As a customer, I want existing history and current safe actions to remain readable while chat is unavailable, so that downtime does not hide progress.
61. As a Store operator, I want availability based on hours, eligible coverage, policy, and manual pause, so that a closed browser does not make service flicker.
62. As a Store operator, I want to select EwaTrade Chat, WhatsApp, or Both, so that the Store uses its eligible response channels.
63. As a Store operator, I want the server to reject a mode that current policy or provider readiness does not allow, so that configuration cannot bypass compliance.
64. As a customer of a WhatsApp-only Store, I want EwaTrade history to stay readable and a clear `Continue on WhatsApp` CTA, so that the channel switch is understandable.
65. As a customer of a Store using Both, I want EwaTrade Chat to remain primary and a secondary `Reach the Store faster on WhatsApp` action, so that I retain choice.
66. As a customer, I want the WhatsApp bridge to require me to send a prefilled opaque code, so that opening WhatsApp alone does not link identities.
67. As a customer, I want WhatsApp to ask whether to continue a recent EwaTrade conversation or start a new Request, so that I control continuity.
68. As a customer who messages the Store directly on WhatsApp, I want a recent-conversation prompt only when a verified Store-scoped match exists, so that EwaTrade does not guess broadly.
69. As a customer, I want a `That isn't mine` option, so that I can reject an incorrect candidate without exposing it.
70. As a customer, I want ambiguous direct-inbound matches to fail closed, so that a phone number does not reveal another conversation.
71. As a customer, I want web, mobile, and supported WhatsApp messages labelled by channel in one timeline, so that I understand where each message occurred.
72. As a customer, I want EwaTrade to show only provider messages it actually observed, so that the timeline does not claim nonexistent synchronization.
73. As a Nigerian Pharmacy customer, I want restricted WhatsApp functionality to stay unavailable unless policy approval changes, so that the Store does not route regulated activity through a prohibited channel.
74. As a Store attendant, I want new conversations in one Store-scoped queue, so that the team can respond consistently.
75. As a Store attendant, I want to claim primary responsibility before replying, so that customers do not receive conflicting responses.
76. As another permitted attendant, I want to view the conversation without racing the assigned reply, so that I can support the primary attendant safely.
77. As a Store manager, I want audited reassignment and handoff, so that responsibility is recoverable and visible.
78. As a Store manager, I want suspended or removed memberships to lose access immediately, so that former staff cannot read private messages.
79. As a pharmacist, I want clinical release to remain separate from conversation assignment, so that being the current attendant does not imply professional approval.
80. As a Quote approver, I want commercial approval to remain separate from pharmacist release, so that neither authority implies the other.
81. As a Store operator, I want unclaimed and overdue conversations escalated, so that customer service failures are visible.
82. As a Store operator, I want an explicit manual pause, so that incidents or staffing shortages stop new submissions safely.
83. As a Store operator, I want messages sent under the Store identity by default, so that private staff information is not exposed.
84. As a Store operator, I want an optional approved public first name, so that conversations may still feel personal.
85. As a Store operator, I want staff replies through supported WhatsApp paths stored with provider delivery facts, so that the dashboard timeline is truthful.
86. As a Store operator, I want unsupported WhatsApp Business App history excluded, so that the database does not invent records.
87. As a Store owner or admin, I want one configuration surface for mode, hours, coverage, pause, QR publication, readiness, and recovery, so that Customer Channels remains business-generic.
88. As a Store owner or admin, I want business category to recommend but never authorize channel setup, so that onboarding remains helpful without weakening policy.
89. As a mobile customer, I want a Customer shell that works without business login, so that Store conversations do not enter merchant onboarding.
90. As a business member who is also a customer, I want explicit Personal and Business switching, so that permissions and navigation never mix.
91. As a security reviewer, I want customer guest credentials isolated from business authentication, so that conversation access cannot grant Store operations access.
92. As a privacy reviewer, I want original prescription records and clinical retention to remain Pharmacy-owned, so that generic chat storage does not weaken regulated controls.
93. As a privacy reviewer, I want sensitive media and voice notes protected by short-lived access grants and audited reads, so that private objects are not public URLs.
94. As an operations analyst, I want aggregate response, unread, availability, bridge, and channel metrics without message content, so that service quality can improve safely.
95. As an operator, I want message and notification retries to be idempotent, so that provider replay does not duplicate customer-visible events.
96. As an operator, I want an expand-contract rollout with Store-level rollback, so that existing public request and Pharmacy paths remain available during migration.

## Implementation Decisions

### Product and bounded-context ownership

- `Store Conversation` is the canonical customer-facing thread. It is scoped to
  exactly one Tenant and Store and must never move between Stores.
- A Store Conversation is not a Request, Quote, Order, payment, booking,
  fulfilment record, clinical record, or workflow engine.
- `PrescriptionRequest`, `ServiceRequest`, and Commerce Inquiry remain the only
  supported typed Request sources for this feature. Exact in-stock Product
  purchase continues through the existing cart/Order path when no clarification
  or Quote is required.
- One Store Conversation may link several typed Requests over time. Each link
  is explicit and revision-safe. Clinical, commercial, operational, media, and
  customer-action commands continue to target the typed source or its exact
  Quote/booking/fulfilment version.
- Conversation-level messages are permitted only for neutral greetings,
  availability, account, channel, and recovery information. Any message that
  changes or describes a Request outcome must carry the exact typed source
  reference.
- A terminal Request does not close the Store Conversation. A new inbound
  message after terminal completion either starts a new permitted Request or
  asks the customer to choose intent.
- When several active Requests could own a message, the server stages the
  message privately and requires an explicit Request choice before attaching or
  dispatching it. It must not infer from sensitive content using customer-facing
  AI.

### Store entry and shared host

- The canonical public host is `chat.ewatrade.com`.
- A Store QR contains `https://chat.ewatrade.com/r/<opaque-token>`.
- The opaque token resolves current Tenant, Store, approved branding, published
  configuration, availability, request kinds, allowed channel modes, and safe
  recovery. It never embeds a Tenant id, Store id, business slug, conversation
  id, provider number, customer id, or private content.
- Tokens are stored and compared as digests, are revocable, and may rotate
  behind a stable published entry identity. Reprinting is not required for
  ordinary channel, credential, attendant, or mode changes.
- A revoked, foreign, malformed, or unpublished token fails before creating a
  Guest Identity, conversation, message, media object, or provider state.
- Store branding is an allowlisted presentation projection. It cannot inject
  arbitrary HTML, scripts, remote tracking, or unreviewed styles.
- Existing Store entry tokens and printed QR codes are preserved through an
  expand-contract adapter. The current `/r` and request routes may redirect or
  render compatibility views until Store-level switch acceptance is complete.

### Guest Identity and device credentials

- A `Guest Identity` is an opaque server record, not a User or proof of a
  person.
- Web uses a random high-entropy device credential carried only in a Secure,
  HttpOnly, SameSite cookie on the shared chat host. The database stores only a
  digest and lifecycle facts; scripts and local storage cannot read the bearer
  credential.
- Mobile stores a separate random device credential in operating-system secure
  storage. Ordinary async/local storage may retain only non-sensitive UI hints,
  such as the last selected conversation identifier when that identifier is not
  itself an access capability.
- A device credential is purpose-bound, rotating, revocable, and limited to one
  Guest Identity. Rotation preserves the previous credential only for a short
  bounded overlap needed for retry recovery.
- The initial default credential lifetime is 180 days of inactivity. The server
  may shorten it for risk or policy. Expiry removes automatic access but does
  not delete conversation or Request records ahead of their applicable
  retention rules.
- Clearing browser data, reinstalling the app, or changing devices loses guest
  access unless the conversation was explicitly linked to an account or a
  separate verified recovery flow is later approved.
- IP address, user agent, push token, email, phone, or browser fingerprint may
  support abuse detection but must never become the identity or merge key.

### Store Conversation and participant model

- A Store Conversation has immutable Tenant and Store scope, a customer
  principal, lifecycle, moderation state, monotonically increasing message
  sequence, created/last-activity occurrence times, and safe presentation
  metadata.
- V1 permits one active Store Conversation for one Guest Identity or Customer
  Account per Store. Linking fails closed if it would create two conflicting
  active conversations for the same account and Store; support/recovery handles
  the conflict without automatic content merge.
- Conversation lifecycle is `active` or `archived`. Archiving is an inbox
  organization state, not deletion. A currently permitted new customer message
  reactivates an archived conversation.
- Moderation is independent from lifecycle. A restricted conversation remains
  readable to authorized parties but cannot submit new customer content until
  reinstated.
- Participants are explicit: guest device, linked Customer Account, eligible
  Store staff, and verified external-channel identity. Participant records do
  not grant authority outside the Store Conversation.
- A Customer Account is an authentication identity and is distinct from a
  Tenant's saved Customer directory record. Any future association between them
  requires its own explicit scoped rule.

### Message and timeline model

- Messages are append-only. V1 does not support editing or unsending a delivered
  EwaTrade message. Corrections are new messages referencing the prior message.
- Each message has one transactional conversation sequence, authoritative
  occurrence time, author kind, channel, message kind, optional typed source
  reference, optional reply reference, lifecycle, and redacted public
  projection.
- Client submission uses a stable client command id. Provider ingestion uses an
  immutable provider event identity. Replays return the original message and
  never append a duplicate.
- Supported message kinds include customer text, Store text, system event,
  Request boundary/status, Action Message, Account Invitation, attachment,
  voice note, channel bridge/recovery, and availability/recovery.
- Channel is an observed fact: `web`, `mobile`, `whatsapp`, or `system`. Channel
  labels appear in the mixed timeline where context matters.
- A provider occurrence time may be retained as evidence, but transactional
  conversation sequence determines presentation order. Late provider callbacks
  update delivery facts and do not reorder unrelated messages.
- Customer-safe projections exclude internal staff notes, OCR/transcription,
  clinical review, object/storage references, provider operation identifiers,
  raw access tokens, secrets, and non-public audit detail.
- Staff-only notes are not customer messages and must use a separate internal
  note/audit contract so they cannot accidentally enter the public projection.

### Request creation and routing

- Entry configuration exposes an allowlist of request kinds. The client never
  invents permission from business category.
- If only one intent is possible, the first meaningful message may create the
  typed Request automatically.
- For a Pharmacy entry configured for prescription intake, a valid first image
  or document may create a Prescription Request and attach through the existing
  private clinical-media path without requiring registration.
- Voice alone never satisfies a required prescription source artifact.
- When multiple request kinds are possible, a deterministic intent Action
  Message asks the customer to choose. Submitted bytes/text remain staged under
  the same private intake command and are attached only after a valid choice.
- Staff assignment routes the conversation, while typed source handlers retain
  authority for intake state, clinical review, Quote readiness, and fulfilment.

### Action Messages and milestone invitations

- Action Messages reuse the existing server-projected customer-action registry
  and its exact source/target capabilities.
- The durable message stores safe display facts and exact internal target
  identity; bearer capabilities are digest-only, expiring, purpose-bound, and
  replaceable.
- Rendering reprojects current action state. An old message remains visible but
  its actions become current, completed, expired, rejected, or superseded.
- Quote messages show immutable Quote Version facts, selectable non-additive
  options, currency, selected state, and exact total. Only one selected/current
  option may progress to acceptance, Order, payment, or reservation.
- `Pay now` opens the established provider-hosted checkout. Navigation does not
  mark payment complete; authoritative callback/reconciliation creates the
  payment system message.
- Destructive or consequential actions retain explicit confirmation.
- The initial Account Invitation milestone is the first released Quote. The
  system may also invite after another clearly valuable milestone, but it may
  not repeat aggressively. Dismissal is remembered per conversation and
  milestone class.
- Account Invitation is optional and cannot obscure or disable the Quote,
  payment, clarification, booking, or fulfilment action.

### Account linking and recovery

- Authentication occurs through the established Customer Account boundary;
  business membership does not automatically claim customer conversations.
- After authentication, the server enumerates only Store Conversations that the
  current Guest Identity credential already authorizes.
- `Link these conversations` is an explicit, confirmed, idempotent command.
- Linking writes an immutable audit event containing actor/account, guest
  identity, conversation, Store, purpose, outcome, and authoritative time but
  no message or media content.
- Matching email or phone may never discover or attach historical conversations
  during account linking.
- The current guest device remains authorized after successful linking unless
  the customer chooses to remove it. Account security lists and revokes linked
  guest devices.
- A conversation already linked to another account, a Store conflict, stale
  credential, or replay with a different payload fails closed and offers a
  bounded recovery path.

### Composer and media

- The composer follows the approved grouped layout: attachment `+` prefix,
  multiline text input, and microphone suffix when empty. Text or any ready
  attachment replaces the microphone with Send.
- Recording is an explicit substate with elapsed duration, cancel, preview,
  rerecord, and send. Recording never starts on a simple focus event.
- Initial limits and MIME allowlists are server-owned, displayed by clients,
  and can vary by Store capability and typed Request.
- Images, PDFs/documents, and voice notes reuse the generic private Media Asset,
  typed Source Attachment, safety, viewer-grant, retry, audit, and retention
  foundations.
- Voice note is a new private media kind with an allowlisted audio MIME set,
  bounded byte size and duration, metadata validation, malware/safety result,
  and controlled playback grant. V1 performs no automatic transcription,
  summarization, intent detection, or clinical interpretation.
- Raw bytes, signed URLs, object keys, provider ids, and recording contents do
  not enter logs, URL state, public projections, analytics, or identifier-only
  jobs.
- Pharmacy keeps authoritative Prescription Media, original comparison,
  safety/OCR interpretation, human line verification, pharmacist release,
  regulated access, break-glass, and clinical retention. Generic media safety
  never means clinical approval.
- Unavailable mode prevents upload/commit. The client may retain an encrypted or
  platform-protected local draft within a bounded lifetime but must not claim it
  was submitted.

### Store Conversation Availability

- Availability is computed on the server from Store Conversation Mode,
  configured conversation service hours, at least one active eligible attendant
  assignment, vertical/professional coverage, current policy, and manual pause.
- Online presence, an open dashboard tab, or websocket connection is not an
  availability authority.
- The projection returns `available`, `unavailable_until`, or
  `unavailable_indefinitely` plus allowlisted reason/recovery codes. Sensitive
  staffing or policy detail remains internal.
- When EwaTrade Chat is unavailable, existing history and current safe external
  actions remain readable. New customer text/media submission is disabled.
- `Notify me when available` requires an in-app device or a verified and
  consented destination. The intent is idempotent and rechecks availability and
  consent immediately before delivery.
- Staff may continue permitted internal work and outbound responses while new
  customer submission is paused, subject to professional and policy gates.

### Store team queue and response authority

- The queue is Tenant/Store scoped and includes safe conversation summary,
  latest customer activity, unread state, current typed Requests, assignment,
  availability/escalation, and response SLA without exposing unnecessary
  clinical content in list rows.
- An eligible active Store attendant claims primary assignment through a
  row-locked, idempotent command before the first business response.
- One primary attendant owns ordinary replies. Other permitted viewers may
  inspect the conversation, but reply commands use current assignment and
  conversation revision guards to prevent conflicting responses.
- Reassignment, release, and handoff require reasons and append immutable audit
  events.
- Membership suspension/removal is rechecked on every read and command and
  invalidates assignment eligibility immediately.
- A pharmacist may separately be an attendant. Pharmacist clinical release and
  commercial Quote approval remain independent capability checks and events.
- Customer-visible sender defaults to the Store. An approved public staff first
  name is optional; legal name, email, role details, and internal identifiers
  are private.
- Unclaimed, overdue, failed-delivery, and abandoned assignments produce
  bounded operational escalation facts. They may influence readiness but do
  not automatically expose staff absence to customers.

### Channel modes and WhatsApp bridge

- Store Conversation Mode is exactly `ewatrade_chat`, `whatsapp`, or `both`.
- Owners/Admins configure the desired mode; the server computes the effective
  mode from current Store capability, policy, provider readiness, binding,
  templates/window, and professional restrictions.
- Mode change never deletes or hides existing Store Conversation messages,
  typed Requests, Quotes, payments, fulfilment actions, or audits.
- In WhatsApp-only effective mode, EwaTrade input is disabled and a primary
  `Continue on WhatsApp` CTA is shown.
- In Both effective mode, EwaTrade input remains available and WhatsApp is a
  secondary `Reach the Store faster on WhatsApp` action.
- Opening or clicking WhatsApp records only an EwaTrade CTA event. It never
  proves that WhatsApp opened, that the customer arrived, or that identities
  match.
- Initiating a bridge creates a one-time, short-lived opaque code bound to the
  Tenant, Store, Store Conversation, Guest Identity/account, desired operation,
  and current provider Connection. Only a digest is stored.
- The code appears in a neutral prefilled WhatsApp message. The customer must
  send it. A valid signed inbound provider webhook and exact code consumption
  create the Channel Bridge.
- After a valid bridge, WhatsApp asks whether to continue the current Request or
  start a new one whenever both are meaningful choices.
- A direct inbound WhatsApp identity may discover a candidate only inside the
  exact Tenant/Store and only through the same Customer Account's verified
  phone or a verified Guest Notification Contact. Phone alone is not a merge
  key.
- Candidate discovery returns no sensitive summary. `Continue`, `Start a new
  request`, and `That isn't mine` are explicit actions. Only `Continue` creates
  a Channel Bridge.
- Multiple, stale, foreign, or ambiguous candidates fail closed and direct the
  customer to the current Store Entry Link or secure bridge.
- EwaTrade persists inbound/outbound Cloud API messages, provider status facts,
  and supported Business App echo/history events only when current Meta
  contracts and Store authorization supply them. The timeline never implies
  full WhatsApp synchronization.
- Nigeria Pharmacy WhatsApp remains default-prohibited. Store configuration,
  customer preference, phone verification, attendant status, or a successful
  technical connection cannot override written policy requirements.

### Realtime delivery and read state

- The authoritative seam is a cursor-based Conversation Projection API. Initial
  load and reconnect fetch messages after the last acknowledged conversation
  sequence.
- Foreground realtime transport is replaceable and non-authoritative. It may use
  a shared realtime connection where supported, with bounded cursor polling as
  recovery. All correctness comes from durable sequence/cursor replay.
- A message is `accepted` when committed, `delivered` to an EwaTrade customer
  device only after that device acknowledges the sequence, and `read` only
  after the customer visibly opens/advances the conversation read watermark.
- Provider messages retain provider `sent`, `delivered`, `read`, and `failed`
  facts separately. EwaTrade device read state and WhatsApp provider read state
  are not conflated.
- Read state is a monotonic participant watermark. Duplicate/out-of-order read
  commands cannot move it backward.
- Foreground beep/sound occurs only for a newly delivered Store response, after
  the user has granted platform permission and while respecting accessibility,
  silent, and focus rules. Visual status always remains available.
- Reconnect, multiple tabs/devices, and replay deduplicate by message identity
  and sequence.

### Unread and availability notifications

- Customer external notification uses the existing durable Notification Intent
  and provider-attempt model rather than sending inside a message transaction.
- A Store response schedules one unread check at 45 seconds by default. Store
  configuration may choose only a value from 30 through 60 seconds.
- Claim rechecks the current customer read watermark, message visibility,
  conversation access, contact verification, consent, account preference,
  channel policy, provider readiness, Store scope, and suppression state.
- Several unread responses in the same bounded period are coalesced into one
  neutral notification. Retry and replay cannot send duplicates.
- In-app realtime and mobile/web push are preferred when a registered device is
  eligible. Verified email or policy-permitted WhatsApp may be selected by
  account preference or explicit Guest Notification Contact consent.
- Guest notification verification is separate from marketing consent and
  account creation. Verification tokens are digest-only, expiring, purpose
  bound, rate limited, and single use.
- Message text is neutral, for example: `You have a new response from <Store>.`
  It contains no prescription, medicine, diagnosis, attachment, Quote amount,
  payment fact, or other sensitive content.
- Reading before claim cancels delivery. Reading after provider send remains an
  immutable occurrence and does not erase the provider attempt.
- Availability notifications use a separate intent and fire only when the Store
  transitions to available and the customer's consent remains current.

### Mobile Customer and Business shells

- One EwaTrade binary contains an unauthenticated-capable Customer shell and the
  existing authenticated Business shell.
- Incoming Store Entry Links always target the Customer shell and bypass
  business onboarding/login.
- On ordinary launch, an explicit incoming link wins; otherwise the app resumes
  the last explicitly used shell. A guest-only user resumes Customer; a
  business-only authenticated user resumes Business.
- The Customer shell contains Store Conversation detail, Conversations list,
  notification/account affordances, and explicit Personal/Business switching
  for dual-role users. Marketplace/catalog exploration is reserved, not shown
  as an unfinished feature.
- Customer guest credentials, cache, deep-link state, and navigation cannot
  satisfy Business authorization. Business authentication cannot silently
  claim guest conversations.
- Conversation content caching follows private-data rules, is minimized,
  invalidated on credential revocation, and avoids unencrypted general-purpose
  local storage.
- Universal/App Link association is owned by the shared chat host. The web page
  does not forcibly redirect after load.
- `Open in EwaTrade app` creates a single-use Conversation Transfer valid for ten
  minutes. Redemption atomically binds the app Guest Identity/device to the
  authorized conversation and consumes the capability. Failure leaves web
  access unchanged.

### Public and staff API contracts

- Public bootstrap resolves only the opaque Store Entry Link, current safe Store
  projection, availability, permitted request kinds, effective modes, and an
  existing/new Guest Identity credential.
- Public APIs derive Tenant, Store, principal, and conversation from server-side
  capabilities; they never accept caller-authoritative Tenant or Store ids.
- Public commands include conversation list/detail cursor reads, message send,
  attachment intent/commit, read watermark, notify-me, contact verification,
  Conversation Transfer create/redeem, Account link, bridge initiation, bridge
  choice, and current Action Message execution.
- Staff APIs derive Tenant/Store/user from session and active context and
  recheck accepted membership and Store assignment. They include queue/detail,
  claim/release/reassign, reply, internal note, moderation, availability/config,
  and escalation recovery.
- Error contracts expose safe typed recovery such as retry, refresh current
  entry, choose Request, verify contact, reopen app, contact Store, or wait until
  available. Raw database/provider errors never cross the boundary.
- Every mutation carries a client operation id and payload-bound idempotency.
- Cursor reads are bounded and deterministic. History pagination never uses
  mutable timestamps alone.

### Persistence and migration

- Additive persistence includes Guest Identity and credentials, verified Guest
  Notification Contacts, Store Conversation, participants, typed Request links,
  messages, read watermarks, assignments/handoffs, channel bridges, Conversation
  Transfers, availability subscriptions, and immutable conversation audit.
- Message attachment records reference the existing generic Media Asset/Source
  Attachment foundation; Pharmacy retains its compatibility link and clinical
  record.
- Action Messages reference existing customer-action capability and target
  records rather than duplicating Quote, booking, payment, or fulfilment state.
- Notification delivery reuses the provider-neutral durable outbox and attempt/
  receipt facts, adding conversation identities only as internal scoped
  references.
- Customer Channels remains the owner of Store Entry Links, channel
  Connections/bindings, attendant routing, desired/effective mode, and QR
  publication.
- Migration is expand-contract. First add conversation persistence and adapters,
  then shadow/create conversations for new intake, then switch selected Stores'
  entry pages, then validate web/mobile/staff/provider compatibility. Existing
  public request, Prescription, Quote, and action routes remain compatible until
  explicit Store-level and production acceptance.
- Historical Request records are not automatically assigned to a guest. A
  current valid public capability may attach a historical Request to a newly
  authorized conversation only when ownership can be proven without contact
  matching.
- No schema contraction, route deletion, legacy capability invalidation, or
  traffic switch is authorized by this specification.

### Privacy, security, abuse, and audit

- Tenant/Store scope is mandatory in every conversation, participant, message,
  assignment, bridge, notification, media, and audit predicate.
- Public bearer tokens are random, high entropy, purpose bound, digest-only in
  persistence, expiring where appropriate, revocable, and absent from logs.
- Sensitive reads reauthorize current membership/principal, Store scope,
  purpose, source visibility, media state, and policy before returning data.
- Rate limits combine Store entry, Guest Identity/device, account, network risk,
  and command type. They never rely on IP alone and never reveal whether a
  private conversation exists.
- Repeated invalid bridge/contact/account-link attempts, malicious attachments,
  spam bursts, and enumeration behavior trigger bounded challenge, moderation,
  or denial before expensive work.
- CAPTCHA or equivalent friction is risk-triggered rather than mandatory for
  every customer.
- Logs and analytics exclude message text, audio, images, documents, clinical
  content, contact destinations, signed URLs, bearer tokens, provider message
  identifiers, and raw provider errors.
- Audit covers guest/account linking, device revocation, staff read/claim/reply/
  handoff, sensitive media access, moderation, availability/mode changes,
  bridge creation, policy denials, and notification consent/delivery.
- Retention is classification-specific. Typed Request and Pharmacy retention
  remain authoritative for their content; conversation presentation links do
  not extend or shorten regulated retention. Guest credentials and notification
  contacts have independent expiry/deletion rules.
- Customer deletion or access requests operate through approved identity proof
  and preserve legally/audit-required facts without retaining unnecessary
  presentation data.

### Reporting and observability

- Aggregate reporting may include conversation starts, active/archived counts,
  first-response time, unread duration, notification outcomes, channel mode,
  bridge conversion, assignment/hand-off, availability downtime, Request source,
  Quote/action progression, and safe provider reliability/cost facts.
- Reporting uses authoritative occurrence times and half-open windows.
- Message content, attachments, clinical facts, customer contacts, provider
  operation ids, guest credentials, and bearer capabilities never enter report
  projections.
- Alerts cover rising queue age, no eligible coverage, realtime degradation,
  notification backlog, media failure, provider/binding failure, invalid bridge
  spikes, policy denial, and cross-scope rejection.
- Realtime transport degradation must fall back to cursor refresh without data
  loss; provider degradation must not prevent EwaTrade Chat when it remains
  independently available.

### Rollout and rollback

- Release is Store-cohort based behind a server-owned switch, not inferred by
  client version or business category.
- Initial rollout uses internal QA Stores, then a non-regulated design partner,
  then a Pharmacy web-chat-only design partner after privacy/media/clinical
  approval. WhatsApp activation is an independent policy/provider gate.
- Rollback restores the prior entry-page/request experience while retaining
  conversation records and typed Requests already created. It never deletes
  messages, media, Quotes, payments, or audits.
- Web, mobile, dashboard, API, jobs, and provider consumers must tolerate both
  pre-conversation and conversation-linked Requests during expansion.
- Production migration, live providers, Pharmacy policy/legal approval,
  traffic switch, and later legacy contraction each require separate authority.

## Testing Decisions

### Testing philosophy

- Tests assert externally observable domain behavior and security boundaries,
  not component internals, private helper calls, SQL formatting, or transport
  implementation.
- The highest practical seam is preferred: a customer/staff lifecycle through
  public/protected API and real persistence is stronger than separate tests for
  every repository function.
- Deterministic unit tests remain appropriate for pure projections, capability
  validation, state transitions, MIME/duration limits, notification choice,
  policy mapping, and redaction.
- Integration fixtures are run-owned, Tenant/Store isolated, Neon-only under
  the established guarded profile, and atomically cleaned. No Docker/local
  PostgreSQL fallback is introduced.
- Provider tests use dependency-injected fakes unless a separately authorized
  live canary is being run. Fake evidence never closes a live-provider gate.

### Seam 1: authoritative Store Conversation lifecycle

- Build one primary verified-database/API acceptance seam covering Store Entry
  bootstrap, Guest Identity issuance/resume, conversation creation, several
  typed Requests, immutable ordered messages, Store queue claim/reply, read
  watermark, Action Message, Quote option selection, current payment handoff,
  Account Invitation, explicit account link, device removal, archive/reopen,
  and exact cleanup.
- Exercise Prescription, Service, and Commerce Inquiry sources without merging
  their persistence or professional rules.
- Prove one customer across two Stores and two Tenants remains isolated; the
  same phone/email cannot cross-link.
- Prove concurrent duplicate sends, staff claims, replies, read commands,
  Action executions, and account-link retries produce one effect or a typed
  conflict.
- Prove stale source/version, expired capability, revoked entry, suspended
  membership, conflicting account link, and ambiguous Request selection fail
  before unauthorized reads or effects.
- Prior art is the existing Service Commerce intake, customer-action, Quote,
  booking, fulfilment, Pharmacy, and run-owned Neon acceptance fixtures.

### Seam 2: channel and notification lifecycle

- Build one provider-neutral lifecycle seam covering EwaTrade message commit,
  foreground cursor delivery, read acknowledgement, 45-second unread intent,
  read-before-claim cancellation, preference/consent selection, neutral email/
  push delivery, retry/replay, coalescing, and failed-provider recovery.
- Cover Chat, WhatsApp, and Both effective modes; manual pause; service hours;
  missing attendant; provider suspension; policy denial; and availability
  notification.
- Prove bridge CTA click does not link, valid inbound bridge message links once,
  direct inbound candidate requires verified Store-scoped evidence and explicit
  confirmation, ambiguity fails closed, and `That isn't mine` suppresses
  inappropriate continuation.
- Prove mixed timeline includes only observed provider events and retains
  separate EwaTrade and provider delivery/read facts.
- Prove Nigeria Pharmacy WhatsApp remains unavailable without an explicit
  current approval fact.
- Prior art is the durable customer-notification outbox, Direct Meta webhook/
  receipt tests, Customer Channels routing matrix, policy gate, and identifier-
  only jobs.

### Seam 3: private media lifecycle

- Extend the generic private-media acceptance seam across web, mobile, and
  supported WhatsApp origins for images, PDFs/documents, and voice notes.
- Cover upload intent, byte/MIME/duration validation, exact replay, safety,
  quarantine, Store/Request attachment, short-lived viewer/playback grant,
  expiry/reauthorization, provider retry, retention deletion, and idempotent
  worker replay.
- Prove unavailable Store submission does not upload/commit and local draft is
  not represented as sent.
- Prove Pharmacy attachment reuse does not bypass Prescription Media, OCR/
  original comparison, attendant verification, pharmacist release, clinical
  access, break-glass, or retention.
- Prove no storage/provider reference or raw media appears in URLs, logs,
  notifications, public projections, or identifier-only job payloads.
- Prior art is the generic media repository/job matrix and Pharmacy private
  media, safety, transcription, and professional-access acceptance.

### Seam 4: cross-platform experience acceptance

- Run authenticated and guest browser acceptance at desktop and compact-mobile
  widths for shared-host entry, restored guest history, composer transitions,
  upload/voice states, Request separators, Quote/actions, Account Invitation,
  unavailable/notify-me, Chat/WhatsApp/Both states, errors/retry, Back/Forward,
  keyboard-only access, screen-reader semantics, scroll containment, and clean
  console.
- Run native Customer-shell acceptance for Universal/App Link routing, fresh
  install, existing install, secure guest resume, Conversation Transfer,
  expired/replayed transfer, Conversations list, last-conversation launch,
  Personal/Business switching, offline/reconnect, keyboard-safe composer, audio
  permission denial, push handling, and revoked-device recovery.
- Run dashboard acceptance for queue loading/empty/error, claim/reply conflict,
  handoff, staff removal, Request context, private media viewer, channel mode,
  hours/coverage/pause, QR publication, readiness/policy denial, and recovery.
- Confirm there is no page-level horizontal overflow, hidden keyboard controls,
  focus trap, inaccessible status-only color, unlabelled recording state, or
  customer exposure of internal/protected facts.
- Prior art is the existing Midday-style global sheet/browser QA, public
  request/Quote/booking acceptance, mobile route/keyboard guards, and Customer
  Channels setup QA.

### Additional deterministic gates

- Pure contract tests cover message kinds, channel labels, availability state,
  modes, action rendering, account-link conflicts, guest credential rotation,
  read-watermark monotonicity, notification grace/coalescing, bridge state,
  voice limits, safe errors, and redaction.
- Migration tests prove additive schema replay, compatibility reads, stable
  existing entry tokens, no automatic historical ownership, Store-cohort
  switch, rollback, and no contraction.
- Security tests cover token entropy/digest handling, CSRF/origin controls,
  enumeration, rate limits, malicious media, cross-Tenant/Store access,
  membership revocation, bridge abuse, notification-contact verification,
  content-free logs, and audit evidence.
- Load/concurrency evidence establishes approved thresholds for active
  conversations, message append latency, realtime fan-out, queue reads,
  notification claims, and media commits before production rollout.

## Out of Scope

- Autonomous customer-facing AI, diagnosis, medicine recommendation,
  substitution, prescription interpretation, automatic pricing, Quote release,
  or pharmacist replacement.
- Automatic transcription or summarization of customer voice notes in the first
  release.
- A separate EwaTrade customer application.
- Marketplace discovery, broad catalog exploration, recommendation feeds, or
  the future semi-commerce browsing surface.
- Replacing `PrescriptionRequest`, `ServiceRequest`, or Commerce Inquiry with a
  universal Request table or arbitrary workflow engine.
- Treating a Guest Identity, browser cookie, installation, phone number, email,
  IP address, or device fingerprint as proof of a person.
- Automatic historical conversation merging by matching phone or email.
- Claiming that EwaTrade can detect a WhatsApp application open.
- Importing or presenting WhatsApp history that EwaTrade did not receive through
  a currently supported and authorized provider contract.
- Automatically enabling Pharmacy WhatsApp in Nigeria or any restricted
  jurisdiction/vertical without current written approval.
- Customer-to-customer messaging, group chat, staff social chat, voice/video
  calling, screen sharing, message editing, reactions, stickers, or arbitrary
  file sharing.
- Offline creation of authoritative new Requests or outbound Store replies;
  drafts may be retained locally but submission requires server acceptance.
- Live provider selection/canaries, production database reconciliation,
  production migration, traffic switching, or legacy contraction without
  separate authorization.

## Further Notes

- This specification supersedes the earlier customer-flow assumption that a
  Store QR must first display `Continue online` versus `Continue on WhatsApp`.
  The default destination is now the EwaTrade Store Conversation; WhatsApp is an
  effective mode/secondary bridge only when currently permitted.
- The shared `chat.ewatrade.com` host supersedes the earlier idea of a business
  or Pharmacy-specific conversation subdomain. Business storefront subdomains
  remain a separate product boundary.
- `WhatsApp-like` and `AI-chatbot-like` describe interaction quality and layout,
  not provider identity or autonomous intelligence.
- Current Meta webhook capabilities support inbound messages and provider
  delivery/read status facts for supported platform messages. They do not make
  a CTA click or application open proof of arrival. Meta policy and technical
  capabilities must be re-read during each separately authorized live release
  window.
- Business App coexistence/history/echo behavior remains conditional on current
  Meta onboarding eligibility and explicit Store authorization. The core Store
  Conversation must remain correct without it.
- Exact retention periods for clinical content remain governed by approved
  Pharmacy privacy/legal policy. The 180-day inactivity value in this spec is
  only the initial Guest device-credential access default, not a content
  retention decision.
- The four approved high-level testing seams are authoritative Store
  Conversation lifecycle, channel/notification lifecycle, private-media
  lifecycle, and cross-platform experience acceptance.
- This `ready-for-agent` label authorizes decomposition into implementation
  tickets after owner review. It does not authorize product code changes,
  provider contact, schema deployment, production operations, traffic switch,
  or contraction by itself.

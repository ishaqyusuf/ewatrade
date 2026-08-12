# Ticket 02 Midday Migration Contract

## Reference Compared

- Existing Customer Channels entry capability and Store attendant assignment.
- Commerce Inquiry payload-bound intake and audit transaction.
- Service Commerce public capability and cursor projection conventions.
- Midday package boundaries, URL-owned navigation, authenticated queue, and
  expand-contract persistence standards.

## Migration Principle

Add a Store-scoped conversation aggregate beside the legacy generic messaging
tables. Preserve current Customer Entry, public Request, Prescription, Quote,
and WhatsApp paths. The first tracer composes one Product/Commerce Inquiry from
the first customer text; it does not rename, reinterpret, or contract existing
records.

## Filesystem Plan

- Add shared Store Conversation contracts under `packages/service-commerce`.
- Add Prisma models in a dedicated `store-conversations.prisma` module and only
  the required relations in base/commerce models.
- Add repository modules/tests under `packages/db/src/queries/store-conversations`.
- Add strict API schemas and compose public/staff procedures under the existing
  Service Commerce router.
- Add same-origin Storefront route handlers for Secure HttpOnly guest-cookie
  issuance and authenticated public timeline commands.
- Replace the compatibility page only when the entry currently permits the
  Ticket 02 web Product Inquiry tracer; retain all other compatibility actions.

## Persistence Plan

- `StoreConversationGuestIdentity` is opaque and not a User.
- `StoreConversationGuestCredential` persists only a digest, purpose, status,
  expiry, and use/rotation facts.
- `StoreConversation` has immutable Tenant/Store/guest scope, one monotonic
  sequence counter, lifecycle/moderation, current assignment, and occurrence
  times. V1 keeps one row per Guest Identity and Store and reactivates archives.
- `StoreConversationMessage` is append-only with exact sequence, occurrence,
  author, channel, kind, payload-bound command identity, and optional typed
  source link. Internal notes are a separate future contract and never use this
  public message model.
- `StoreConversationRequestLink` links typed sources without moving their
  lifecycle authority into Conversation.
- Assignment and audit facts are Store/Tenant scoped and append-only where
  history matters.

## Transaction Plan

- Bootstrap resolves the digest-backed published Store Entry and current web
  readiness before creating/resuming Guest Identity and Conversation.
- First customer text row-locks the Conversation, rechecks entry/readiness,
  validates the guest credential, creates exactly one Commerce Inquiry and
  Request link, increments sequence, appends one message, and records the
  payload-bound receipt in one transaction.
- Retry returns the original projection; same operation id with different
  payload fails closed. Store claim/reply rechecks active Membership and Store
  attendant assignment inside the write transaction.

## Public API/Cookie Plan

- Browser credential uses `Secure`, `HttpOnly`, `SameSite=Lax`, shared-chat-host
  scope, and no script-readable/local-storage bearer.
- Same-origin Storefront route handlers own Set-Cookie. Repository/API inputs
  receive the bearer only server-side and store/compare its digest.
- Public projections return opaque conversation/message ids, safe Store name,
  bounded text timeline, safe sender label, channel, sequence, occurrence, and
  cursor. They exclude Tenant/Store/Guest ids, credential digests, provider ids,
  audits, raw errors, and internal notes.

## UI Plan

- The shared-host page becomes a compact Store conversation only for the
  Product Inquiry web tracer. Other allowed Prescription/WhatsApp choices stay
  on the Ticket 01 compatibility seam.
- Empty/loading/error/retry and sending states are explicit. The grouped
  composer has a disabled attachment prefix placeholder, multiline text, and
  Send state; media/voice/realtime remain later tickets.
- The authenticated Store queue/detail UI is Ticket 04. Ticket 02 exposes the
  typed staff API/repository seam and proves it through acceptance.

## Testing And Acceptance

- Contract tests first for bounded commands/projections/cursors.
- Fake-repository tests for auth-before-read, row lock, payload mismatch,
  atomic Inquiry/message/link, assignment, reply, redaction, and scope.
- Generated migration through root `db:migrate` and `db:push`; never hand-write
  migration SQL.
- Verified-Neon run-owned QR→guest→message→claim→reply→reload acceptance with
  duplicate/concurrency/cross-scope/cleanup checks.
- Desktop and 390px shared-host browser QA after source and database gates pass.

## Open Questions

None. Ticket 02 deliberately ships text-only web tracing and preserves every
later media, mobile, realtime, account, notification, and WhatsApp boundary.

## Conformance Result

Complete. Shared contracts live in the domain package, Store/Tenant-scoped
transactions live in the database query boundary, API and Storefront handlers
remain orchestration-only, the customer credential is server-cookie owned, and
staff/customer projections are intentionally separate. The one intentional
deferment is authenticated queue UI, owned by Ticket 04; Ticket 02 proves the
complete staff seam through repository, protected API and verified-Neon
acceptance.

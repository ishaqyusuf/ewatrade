# G05 packet 1: assistant manual-share Service messages (source handoff)

Status: source-only, under coordinator release 310e6761. Planned dashboard
capabilities; not accepted, not promoted, no connected run. Accepted roadmap
stays 13/45 (28.9%).

## What it does

- `services.message.share` (`service_message_share`) records a message the
  staff member says they ALREADY shared themselves (in person, or by SMS or
  WhatsApp from their own phone) with a saved Service Job's customer.
- `services.messages.read` (`readServiceMessages`) reads that Job's bounded
  message history.
- Nothing is sent. No provider is called, no app or link is launched and
  nothing is queued. The record shows in the customer's tracking history.

## Input and recipient

- Strict draft fields only: `jobId`, `channel` (manual/sms/whatsapp), the exact
  `message` (1–1000), optional `reason` (≤500) and `alreadyShared: true`.
  Recipient, Store, tenant and authority fields are refused by the schema.
- The recipient is the Job's Order snapshot (name, phone, email). SMS or
  WhatsApp is refused when the Order has no phone.

## Persisted fact

- One `ServiceNotificationIntent` (MANUAL, COMPLETED, `completedAt`, exact
  message, Order phone/email snapshot, Store, Job, creator) plus one
  `ServiceManualShare` (reported channel, note, sharer), created together in
  the caller's transaction.
- No dispatch fields, delivery attempts or enqueue path.
- The dispatcher predicate selects only SMS/WhatsApp PENDING/READY, so it never
  picks this up. A unit test pins that predicate.

## Review and receipt wording

- Review: "Record that you already shared this message with <customer · contact>
  for <order>", how it was shared, the message, any note, then "This is a
  staff-reported record. ewatrade sends nothing, launches no app and does not
  verify delivery." and "The message will appear in the customer's tracking
  history for this Order."
- Receipt: existing `order` kind, record = intent id, opens the Order. Title
  "Manual share recorded". The detail repeats that nothing was sent and
  delivery is not verified. The existing order kind avoids a new receipt kind.

## Locking, idempotency and drift

- Confirmation runs in the existing Serializable proposal transaction. It locks
  the Order `FOR SHARE`, then the Job `FOR UPDATE`, re-reads both, re-reviews
  and compares the signed review revision. The revision covers Job revision,
  Order and recipient snapshot, Store, channel, message, reason, the
  acknowledgement and the actor.
- Idempotency key = proposal key, on the existing unique
  tenant/businessEventKey/audience/purpose index.
- Replay returns the original only when every persisted fact matches: Job,
  Store, MANUAL/COMPLETED, message, phone, email, creator, exactly one share
  and no attempts, share channel, note and sharer. Otherwise it is refused and
  nothing changes.
- Authority is re-checked before the replay lookup, so a revoked or narrowed
  actor's completed replay is refused.

## Authority

- Fresh persisted membership/Store access, exact active Store = Job Store,
  tenant and the non-clinical commercial-Service guard.
- Owner, Admin and legacy Manager only. Scoped Managers are refused by the
  command and centrally; no staff-procedure-policy grant was added.

## Native procedures

- `serviceCommunications.recordManualMessage` (Serializable 10s/30s) and
  `serviceCommunications.listMessages` (RepeatableRead 10s/30s).
- Both use `assertServiceManager` and an active Store, call the same canonical
  functions and map `ServiceIntakeReviewError`/`CatalogError` to tRPC codes.
- Existing provider procedures stay planned.

## Read projection

- Newest first: at most 20 intents (`hasMore` flagged), 3 shares and 3
  attempts each.
- Safe fields only: no provider keys or attempt IDs, and the phone as its last
  four digits.
- Kinds: `staff_reported_share`, `provider_pending`,
  `provider_sent_unconfirmed`, `provider_failed`, `provider_delivered`,
  `cancelled`. Delivery and consent are never inferred from snapshots.

## Evidence actually run (offline)

| Check | Result |
| --- | --- |
| `packages/db/src/queries/service-manual-message.test.ts` | 8 pass (in-memory transaction) |
| `apps/api/src/assistant/general-service-message.test.ts` | 5 pass (canonical commands stood in) |
| `packages/assistant/src` (includes new contract test) | 238 pass, 22 skip, 0 fail |
| `apps/api/src/assistant` | 345 pass, 7 skip, 0 fail |
| `apps/dashboard/src/components/general-assistant` | 52 pass (new editor: 2, static only) |
| API and dashboard `tsc --noEmit` | 0 diagnostics |
| assistant `tsc --noEmit` | only pre-existing `contracts.test.ts:264` TS2769 |
| coverage `--check` | current |
| impact gate | exit 1 only for foreign `orders.activity.confirmUpload` and `orders.activity.uploadTarget` |

## Not run / remaining

- Connected command, rollback and audit; real concurrency. Duplicate
  concurrent requests rely on the unique index plus the Job `FOR UPDATE` lock,
  by source review only.
- Browser UI.
- Native router test: the procedures are thin wrappers and no router test was
  added.
- Mobile (out of scope).
- Mobile `tsc` reports 85 errors in shared DB/API files outside this packet,
  none in its files.

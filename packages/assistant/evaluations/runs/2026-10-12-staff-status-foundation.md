# S03 canonical status foundation — 12 October 2026

Source milestone only. S03 is partial and unbookmarked; accepted roadmap remains
13/45 (28.9%), with 32/45 (71.1%) awaiting acceptance. This checkpoint does not
complete signed assistant confirmation, saved web acceptance or operating rollout.

## Change

A shared locked preparation/review now owns status selection and transition rules.
The native command joins a caller-owned transaction or opens one bounded root
transaction (10s max wait, 30s timeout). Lock order: active Tenant update, fresh actor
Membership share, same-Tenant mutable target Membership update, current assignment
Stores share. Tenant serialization matches invitations and avoids reciprocal
legacy-Manager status writers holding each other’s actor lock. Current status management keeps Owner/Admin and LEGACY Manager;
SCOPED Manager remains denied. Protected roles, self-change, REMOVED, unavailable
and unchanged targets refuse. Existing native callers may omit revision/reason;
new fields are additive and assistant confirmation will require both.

Status writes increment staffAccessRevision without changing acceptedAt, business
role, access mode, catalog grant, Store grants or starting Store. Reactivation
requires an original acceptedAt, active same-business current assignments/default
and Manager-backed catalog grant for SCOPED members. Current subscription staff
usage must not exceed its limit; SUSPENDED already counts, so equality is allowed.
No grant is restored. Suspension retains existing canonical conversation release.
Existing orders, jobs and historical authorship are not changed.

Lifecycle history is mandatory: profile/event failure propagates to the transaction
rather than permitting an unaudited status change. Original from/to role and status,
actor, reason and event ID are recorded/returned using existing schema fields.
Read review projects exact membership, safe identity, current revision, acceptance,
mode/default/catalog/current Store grants and explicit whole-business impact; a
SHA256 digest pins original review facts. It does not mutate or reserve access.

## Executed evidence

- `bun test packages/db/src/queries/staff-status-change.test.ts packages/db/src/queries/staff-store-access.test.ts`:
  **18 pass, 0 fail, 83 assertions**. Includes canonical in-memory suspend/reactivate,
  accepted timestamp preservation, counted-seat equality/over-limit, fresh actor,
  native LEGACY Manager compatibility, self/protected/removed/missing/unchanged,
  stale/malformed revision, invalid reason, revoked-all/archived/foreign/default/
  catalog guards, review redaction/digest freshness, strict audit failure and bounded
  root seam. In-memory positive reactivation creates no database grant.
- Scoped TypeScript configuration `artifacts/assistant-operations-web/s03-status-types.json`:
  terminal **34011, exit 0**; refreshed verifier types also pass after correcting a widened literal union. No broad
  project/mobile typecheck was run. Three new source/verifier files pass Biome.
- Exact owned `ewatrade_qa_v1` verifier:
  `node artifacts/assistant-operations-web/staff-status-rollback.mjs`, terminal
  **6724, exit 0**, **13,826.413 ms** (history56669 also passed13,584.222ms; initial suspension/refusal-only23744 passed11,379.555ms). Only INVITED rollback fixture is seeded.
  Original review is read-only; INVITED→SUSPENDED records original reason/event,
  keeps acceptedAt null, increments revision1→2 and leaves exact Store rows intact.
  Unaccepted reactivation, stale revision and already-suspended retry all refuse
  with full refusal-stage staff/auth/chat/budget facts unchanged. Forced rollback
  then proves the full saved snapshot unchanged. Exact canonical history projection
  also returns the original actor/reason/before-after/event ID and total1 without
  changing facts. **ACTIVE staff grants0, provider0**.
  Existing pg concurrent-query deprecation warning remains; no failure observed.

The authoritative local result is `artifacts/assistant-operations-web/s03-status-rollback.json`.
No schema/migration, mobile, provider/model/mail, persistent configuration/visibility,
fixture deletion, API restart, push or deploy occurred. No persistent UI source changed. The existing native history component rendered the
actual canonical rollback DTO in a protected QA source preview; desktop before/after,
actor/reason/event identity and preserved grants/revision were visibly verified.
Screenshot: `artifacts/assistant-operations-web/s03-status-history-source-web.jpg`;
zero captured warn/error. UI projection was captured from56669 before the final
Tenant serialization change;6724 reverified identical history invariants. Own route/tab65 removed, ignored preview retained. This
is source-object evidence, not saved assistant/receipt/global web acceptance.

## Open S03 requirements

Strict assistant payload and natural exact staff lookup; signed reason/revision/hash
review/Edit/re-review/Confirm; immutable original receipt and owning global object;
fresh active session/proposal/offline suspension refusal evidence; actual lock
concurrency; saved web Open/Close/reload/recovery; accepted staff reactivation and
subscription changes under controlled QA. Planned assistant access is not runtime
availability. Source evidence cannot earn an acceptance bookmark.

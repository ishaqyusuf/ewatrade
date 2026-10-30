# WhatsApp and Domain read intervals — 30 October 2026

Local DP-204/A2 slice of the [full Dashboard program](../plans/2026-10-29-dashboard-performance-program.md).
Parent `f1a13d76b`; program acceptance remains **4/27 (14.8%)**, all59 routes/nine
families retained. No deployment, service restart, provider action or business
submission. This is read-lifecycle proof, not a page-load or p95 improvement claim.

## Cause and change

Six mounted readers kept issuing interval reads after known access/not-found
refusals. `retry:false` does not stop subsequent interval ticks. Their app QueryClient
already erased refused query payloads. Each now uses the existing `readPollInterval`
classification: FORBIDDEN, UNAUTHORIZED and NOT_FOUND stop the interval; queries stay
enabled for focus/invalidation/manual recovery. Successful recovery resumes the
original cadence. Transient errors retain interval recovery.

| Historical audit site | Owner | Preserved cadence and terminal rules |
| --- | --- | --- |
| P08 | Owned WhatsApp connection pages |30s, current actor/private fresh mount |
| P09 | Selected WhatsApp chat context |15s, current selection/cache generation |
| P10 | Connect scope context |15s, current actor/Tenant/Store |
| P11 | Connect availability |15s, enabled only after matching current context |
| P12 | Connect link status |2s; confirmed/cancelled/expired and local expiry stop |
| P20 | Selected Domain order |5s; UNCERTAIN30s; REGISTERED or REFUNDED stop |

The one-time WhatsApp URL/QR also lived in component state after the query payload
was refused. Its existing output block now hides on a known status refusal and
stays hidden through a pending retry or a later transient failure without restored
data. A successful fresh status read reveals the still-valid link. The guard also
uses query error history because TanStack clears the error when a pending fetch
starts. Initial pending behavior and transient failures with retained valid data
keep their previous display behavior. The existing error/Check again controls
remain available; no new mutation, timer or cached authority is introduced.

Keys/inputs, fresh-mount/zero-retention policy, cancellation signals, actor/generation
checks, scope selection, proof/revision confirmation, expiry, withdrawal, commands
and invalidation remain. Existing UI clocks are unchanged. Domain FAILED with
REFUND_PENDING continues recovery; UNCERTAIN is not treated as terminal. No backend,
mobile, payment, registrar, assistant protocol or provider configuration changes.

Midday's local `use-job-status.ts` supplies the explicit enabled/terminal/error
ownership pattern. EwaTrade retains its own refusal classification, transient
recovery and durable refund semantics. The existing app-connect fresh-read contract
and selected WhatsApp implementation standard were reviewed. This repairs app read
policy/private output visibility; no conversation case, message/button meaning,
canonical effect, consent or continuation destination changes. No Workshop/Site
revision or live conversation acceptance is claimed.

## Verification

- Actual components, app QueryClient, installed query/infinite observers, tRPC
  options/client and inert observable transport reproduce18 refused-interval
  failures. Six transient cases already pass in that red run.
- Adding link visibility assertions reproduces three stale-URL failures; holding
  recovery open then reproduces three pending-retry failures. Final **32 tests/170
  assertions pass**, covering18 known refusals, six transients, three link terminal
  states, two Domain terminal states, two durable recovery cadences and no selected
  order. Denied query data clears, interval work stops, focus succeeds and cadence
  resumes; a held link retry keeps private outputs hidden until successful delivery.
- Synthetic DOM, presentation, QR, URL hook and scope-picker callback are inert
  ports. One inert create-link response activates the real status owner; no real
  link/grant/message/order is created. Fetch is trapped; every case asserts zero
  external calls. This does not prove actual picker/server permission/provider
  behavior. Separate existing lifecycle proof remains unchanged and passes.
- Both isolated wrappers pass (two outer tests/eight assertions). Full Dashboard
  and explicit fixture TypeScript graphs pass. Owned five-path quick plan/check
  passes237 tests/1533 assertions plus QA tooling types and Biome, zero unknown
  mappings. Foreign Agent Chat/staged explainers are excluded. H01 unchanged valid
  coverage evidence is reused; H02 passes with no capability/procedure row delta.
- Current development IAB `/account/whatsapp` settles into the expected unavailable
  account/restricted personal-session messages with no link actions. Temporary tab
  closed; no connect/confirm/revoke/provider action or grants created. Successful
  personal connection and selected paid Domain progress are covered only by the
  inert regressions, not this restricted live session.
- Canonical existing-data local web smoke passes **12:16:34.525Z–12:16:53.907Z**,
  with five owned source hashes and lock frozen and verified unchanged. Existing
  login/profile, populated Catalog, sale-draft total/cancel and navigation/sheet
  cancellation pass with zero business submissions. It does not exercise a live
  WhatsApp link or Domain order. `runtimeVerified:false`; development evidence,
  no release qualification. API/Storefront/Marketing and development mode retained.

Private evidence: `/tmp/ewatrade-dashboard-program-20261029/connection-refusal-*`
contains red/final/wrapper/type/quick/H02 logs, frozen SHA-256 input manifest and
copied canonical receipt. No credentials, actor/Store IDs, SQL, request bodies or
private response payloads are included in this tracked record. The current root
optimized `zMN4q6wxzuTfj0KPK4a8Y` artifact excludes this and the preceding Service
form slice; no optimized timing or dashboard-wide speedup is claimed.

The [historical polling ledger](../plans/2026-10-30-dashboard-polling-audit.md)
remains pinned. P28 attachment recovery/budget, A3 QA entry visibility, aggregate
background cost and full DP-204 acceptance remain open. Brain BRAIN/task/QA,
navigation, WhatsApp and managed-domain pointers updated locally. No API/schema
or durable architectural contract change; API docs, migration and new ADR are
not required. Other23 tickets remain open.

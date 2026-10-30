# Local admission scheduling assessment —30 October2026

Follow-up to [Order read effects](2026-10-30-dashboard-order-change-read-effects.md)
and [partial-stream attribution](2026-10-30-dashboard-received-bytes.md). No product,
API, policy, scope, transaction or dependency change. Program remains4/27; the
assessment rejects a proposed local optimization before implementation.

## Rejected candidate

`createTRPCContext` reads QA-session proof and legal status sequentially after
resolving its candidate session. Their source position alone does not establish
a useful local waterfall. The canonical legal helper returns immediately outside
production/testing policy and when no effective publication requires admission.
The existing fixed local Activity diagnostic records the following phases:

| Fixed read | Auth | QA proof | Legal | Workspace scope | Context | Transaction control |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Activity filters |210.2ms |213.4ms |0ms |209.5ms |633.2ms |652.2ms/3statements |
| Activity list |209.8ms |211.0ms |0ms |217.3ms |638.4ms |624.4ms/3statements |

These are historical isolated GETs from browser-stream-families/activity-reads.json,
not new page timings or a certified current API revision. QA-domain work in these
samples is0.1/0.3ms; intermittent central-policy availability is not thereby solved
or attributed. Durations overlap; transaction-control elapsed time is not pure
network/pool wait. Context and transaction phases must not be added indiscriminately.

Parallelizing zero measured legal work cannot address the observed local wait.
No implementation or test-only production environment is introduced to manufacture
a failing local case. QA proof can revoke invalid sessions through its canonical
cleanup; it must never be treated as an inert permission-free speculative read.
Fresh proof, legal, scope and native-write behavior remain unchanged.

## Activity startup boundary

Actual Activity route first resolves current session, workspace role/timezone,
Membership and scope identity. The client adds a per-mount identifier,0 freshness/
retention, abort-on-unmount and explicit restart ownership. Both its filters and
list already start together. A known access/cursor refusal on either hides all
rows, counts, choices, scope and selected names. Unscoped route/intent prefetch
cannot hydrate these keys or replace their fresh mount contract. Prior code-only
warming experiments also failed to advance the enclosing API start.

No speculative prefetch, reused prior-visit result, longer TTL or skipped entry
check is added. Next work should examine remaining transaction/control/projection
round trips with actual caller/SQL evidence, or another measured owner that can
change without weakening this contract. Any proposed replacement owner needs
explicit equivalent scope/entry/refusal proof before implementation.

## Evidence and boundary

Five relevant API/legal/policy/Activity source files match current HEAD. Private
admission-scheduling-assessment.json records their hashes, the existing diagnostic
hash and fixed numeric extraction. No new connected request, fixture, provider,
service switch/restart or deployment. No new latency or acceptance claim; original
27 criteria and all23 open tickets retain their scope. The preceding Order commit's
focused/source/type/H02/canonical proof remains valid; no source changed here.

Brain BRAIN/task/QA/navigation current checkpoints updated locally. No API contract,
schema or durable architecture decision changed, so those documents need no update.

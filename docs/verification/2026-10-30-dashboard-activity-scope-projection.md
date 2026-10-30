# Activity scope projection —30 October 2026

Parent `7536934f1`. DP-103/407 implementation slice; full program remains 3/27 accepted.
Local only. No deployment, service restart, business fixture or permission mutation.

Activity scope previously issued a Membership row-lock SELECT, a separate nested
Membership/Tenant/subscription/assignment read, then its ordered Store read. The
first two now share one parameterized SELECT with `FOR SHARE OF m`, using the
caller’s existing transaction. Scope resolution uses two operations instead of
three. Connections, transaction options, freshness and public DTOs stay unchanged.
The same helper also serves existing notification-state callers.

The query retains inactive Membership locking before refusal, active Tenant/member
admission, same-Tenant active assignments/Stores, subscription facts and exact
role/revision metadata. Existing role allowlist, ordered Store selection, creator
visibility, Finance entitlement and cursor signature remain byte-identical after
the projection. No cross-request cache or broader access is introduced. Missing
facts refuse; inconsistent joined subscription facts fail closed.

## Validation

- Actual helper and scope execute against disposable in-process PostgreSQL,
  never the application database. Nine focused scope/legacy cases pass with
  313 assertions. This includes 84 role/mode/subscription combinations, inactive
  and foreign scope refusal, sequential role/grant/revocation changes, optional
  subscriptions, JSON/date facts, bound inputs and errors.
- PostgreSQL tuple/page inspection compares the held lock with the old canonical
  `FOR SHARE`, verifies the current transaction’s SHARE lock, retention until
  caller commit and release afterward. This is not a two-session live grant race.
- The old three-operation implementation fails the private two-operation probe;
  the current implementation passes. Store/read/filter/notification callers,
  billing policy and downstream scope predicates match the parent exactly.
- Owned DB graph, API production import graph and full Dashboard types pass.
  Scoped fast checks pass (237 tests/1533 assertions plus QA tooling types and
  Biome). H01 coverage is current; H02 passes with zero capability/procedure changes.
  Foreign Agent Chat and staged explainer files are excluded from owned checks.
- Existing DTO/markup/commands are unchanged; no duplicate ordinary UI pass is
  required for this SQL-only slice. No browser speedup, optimized budget or full
  Activity ticket acceptance is established by these unit/SQL checks.

No schema/index/migration or public API contract changed. The prepared optimized
Dashboard artifact is still `f027263c`; its four manifest hashes match and exclude
this later source. Runtime timing must record that distinction.

Private evidence: `/tmp/ewatrade-dashboard-program-20261029/`:
`activity-scope-{red,green-probe,tests,types-final,api-types-final,dashboard-types-final}.log`
and `activity-scope-parity.json`. The diagnostic scripts stay ignored.

Brain impact: BRAIN index, in-progress task, web-navigation-performance,
business-activity-notifications and API permissions notes updated locally.
Existing Activity architecture remains; no new ADR is needed for the equivalent
projection implementation. Schema/migrations and API contracts need no update.

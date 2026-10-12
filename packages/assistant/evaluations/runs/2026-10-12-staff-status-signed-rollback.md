# S03 signed staff-status rollback

One exact-QA run through the real GENERAL decision dispatcher passed all four
finite cases. Terminal47457 exited0; process-only capability visibility was
restored and the database client disconnected. No provider, persisted fixture,
new session/grant, ACTIVE fixture membership or API restart.

| Case | Elapsed | Result |
| --- | ---: | --- |
| Suspension/completed replay | 10,028ms | Original durable event, reason/actor and atomic completed receipt; grants unchanged; replay adds no effects |
| Cancellation/replay | 6,856ms | Original INVITED membership/revision preserved; no suspension event; replay adds no effects |
| Changed approval token | 4,220ms | CONFLICT; transactional facts unchanged |
| Stale membership revision | 5,247ms | CONFLICT; transactional facts unchanged |

Each case ended with an identity-checked deliberate rollback and reread covered
saved staff/auth/chat/global-budget fingerprints. The signing key and invitation
custody key existed only in the disposable runner process. Scope and an existing
active session were explicitly pinned; the fixture remained unaccepted and never
received ACTIVE membership. Native original event lookup matched the signed intent.

Replay is within the same caller-owned transaction. This does not prove persisted
or concurrent HTTP recovery, accepted reactivation, active-work release ownership,
or full saved dashboard confirmation. S03 remains planned/partial/unbookmarked;
accepted tickets remain13/45. Existing source/editor screenshots are reused.

Ignored local evidence:
`artifacts/assistant-operations-web/s03-status-signed-rollback-v1.json` and
`s03-status-signed-terminal-v1.log`. Source verifier commit `5b1b90f7`.

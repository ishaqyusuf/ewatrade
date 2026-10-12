# G02 recovery and fresh-scope rollback v1 — 12 October 2026

**Connected source suite passed; full acceptance pending.** G02 remains
partial/planned/unaccepted; accepted roadmap remains 13/45 (28.9%).

The coordinator reviewed exact ACTIVE Store/open Book interval preflight and
foreign-Store schema/ownership guards, confirmed all other slots released, then
scheduled one recovery suite. Approved normal-network exec session **93018** reached
terminal **exit 0**. No automatic retry or further connected action followed.

| Case | Elapsed | Actual evidence |
| --- | ---: | --- |
| Original receipt-write failure | 13.646s | Native count/command existed before this exact proposal's COMPLETED receipt write; injected error identity escaped the real owning transaction and rolled back effects |
| Same-key recovery | 18.202s | Same reviewed payload/proposal/approval/command key recreated in rollback-only PENDING baseline; one original count/receipt, completed replay with no write, wrong-Book original read refused |
| Expired session | 4.354s | Fresh confirmation returned UNAUTHORIZED; seeded proposal/native facts unchanged |
| Suspended membership | 5.932s | Fresh confirmation returned FORBIDDEN; seeded proposal/native facts unchanged |
| Foreign proposal Store | 6.395s | Exact non-owning marker, no Store fixture; fresh confirmation returned NOT_FOUND; seeded proposal/native facts unchanged |

Each case used one real Serializable root transaction with maxWait 10000/timeout
30000 and retained every full saved-state comparator. All **72 entries** matched
before/after each rollback: 39 Finance tables across every Tenant Book, 18 authority/
auth/assistant graph aggregates (including all budgets), 15 opaque budget-row
diagnostics. Changed-table lists were empty, forced rollback reached, and no retained
proposal/command. Full JSON arrays and metadata were locally checked after terminal.

Exact QA database/Tenant/ACTIVE Owner/email/existing GENERAL conversation guards
passed, with exact ACTIVE Store in that Tenant and an existing open Book interval.
The schema metadata guard found no Store-column FK and the marker matched no owning
Store; no Store/grant was created. Canonical fresh authority was not bypassed.
No row content, budget key, token or signing secret was saved. Random process-only
signing material and process-only visibility were used; visibility restored in
`finally`, client disconnected, child exited and exclusive slot explicitly released.
Provider calls 0, committed fixtures false, persistent availability unchanged,
acceptance false. Pg parallel-query deprecation warning retained, no error/timeout
treated as a pass.

Evidence under `artifacts/assistant-operations-parallel/G02/`:

- `recovery-terminal-v1.txt`
- `recovery-case-evidence-v1.json`
- `recovery-rollback-result-v1.json`

This is real dispatcher/canonical command/receipt transaction composition. The retry
baseline is recreated in each rollback transaction; no persisted pending draft,
independent/concurrent HTTP retry or saved-browser acceptance is claimed. Native
history/day summary/checklist and registered transport/saved global sheet/chat-draft
evidence remain open. Privileged fiscal closing remains unavailable while canonical
source completeness is unresolved. Initial signed budget mismatch remains unknown;
both its failed attempt and subsequent [passing diagnostic](2026-10-12-g02-signed-rollback-diagnostic-v2.md)
are retained.

Focused recovery+runner nonincremental types and one-file guard Biome passed before
scheduling. Existing eight source safety tests/38 assertions and signed diagnostics
checks remain. Only permitted guard changes preceded this run; source otherwise
frozen. No provider/model/mail, persistent flags/key, ACTIVE staff grant, saved fixture
deletion, owned API restart, HTTP/browser testing, schema/migration, mobile,
stage/commit/push/reset/stash or deployment. E05 approval unchanged.

Brain impact: `.brain/plans/2026-10-12-g02-signed-proposal-acceptance.md` updated for
this actual pass and remaining gates; common catalogs remain coordinator-owned.

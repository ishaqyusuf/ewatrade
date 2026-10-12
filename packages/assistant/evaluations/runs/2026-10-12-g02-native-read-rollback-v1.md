# G02 native history/day reads — actual scheduled source run, 12 October 2026

After D04 disconnected, coordinator reviewed the verifier/launcher and assigned
one exclusive four-case native attempt. Normal network approval review allowed it.
Terminal session **72126 exited 0**; the runner disconnected in finally and its
child exited. The QA slot was released by direct coordinator report. No retry or
HTTP/browser execution followed this attempt.

| Case | Elapsed | Actual result |
| --- | ---: | --- |
| Bounded saved history | 2.566s | Native limit/currency/order checks passed; history empty |
| Unknown history cursor | 2.447s | Actual native CONFLICT |
| Missing/nonowning history Book | 2.246s | Actual native NOT_FOUND |
| Native day summary/checklist | 7.111s | Exact Book/currency, completed UTC day, same native watermark and unresolved operational-close caveat |

All four reached the forced rollback sentinel in one real native RepeatableRead
transaction each, preserving maxWait10s / timeout30s. All transaction-local
all-table/all-budget fingerprints were unchanged. Each saved root before/after
array was independently compared after execution: **72 entries exactly equal**
(39 Finance tables, 18 aggregate scope tables, 15 opaque individual budget rows),
with `changedTables=[]` for all four cases. No count, proposal, journal, Book,
period/fiscal lock, auth, chat, usage or budget mutation was retained.

Exact local/development flag, QA database, existing active Owner/Tenant/Store,
alive session and saved GENERAL conversation guards passed. Runtime Finance table
inventory matched. No fixture was created, even transaction-locally. Approval key
was random process-only for source General scope; no persistent key or rollout
change. Provider0, acceptancefalse, committedfalse, persistent availability unchanged.

**Coverage limits:** actual saved count history is empty (`savedCountAvailable=false`)
and positive pagination unavailable (`positivePaginationAvailable=false`). The
conditional original native detail comparison therefore did not run. No original
saved receipt/detail or positive next-page proof is claimed. Missing Book marker
is not an actual other-Tenant Book, and unknown cursor is not an actual another-
account cursor. Native source composition/session preflights are not registered
HTTP middleware or actual saved-browser fresh authorization proof. Operational
reconciliation remains uncertified; no fiscal closing becomes available.

Ignored evidence: `native-read-terminal-v1.txt`, `native-read-case-evidence-v1.json`,
`native-read-rollback-result-v1.json` under `artifacts/assistant-operations-parallel/G02`.
These store only safe summaries and opaque fingerprints, no credentials or raw
financial/chat records. No Pg warning appeared in this terminal log.

Remaining gates: separately reviewed/scheduled saved-session HTTP reads, actual
saved-browser global object sheet and unsent chat draft preservation, qualifying
original saved count fixture/positive pagination and other acceptance gaps in the
G02 plan. Rolled-back IDs may not stand in for saved receipts. No API restart,
provider, persistent fixture/key/grant/visibility change, staging/commit or mobile
work. Initial signed-run unexplained budget mismatch remains in its historical
failed-attempt report; later passes do not erase it. G02 stays partial/planned/
unaccepted; accepted remains13/45.

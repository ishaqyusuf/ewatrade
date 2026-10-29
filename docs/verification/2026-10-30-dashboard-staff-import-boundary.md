# Staff notification import boundary — 30 October 2026

Partial DP-302/407 under the [27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Primary checkout; parent15489dc9, owned source/lock hashes retained privately.
Local preparation and checks only: no deployment, shared runtime switch, manual
service restart, invitation/business submission, schema/provider change.3/27 accepted.

## Actual build finding

The normal optimized Dashboard build at15489dc9 succeeds (Next16.4.3/Turbopack,
compile9.6s, TypeScript46s). It reports two whole-project filesystem-tracing
warnings through the Staff HTTP route's jobs-root import, which pulls unrelated
manual-receipt/private-media workers. Its Staff route trace has1715 files. These
are build/import facts, not a measurement that Staff causes Catalog latency.

A tight offline Bun.build loop with fixed external libraries reproduces the
producer graph importing25 unrelated worker modules among1697 inputs. That red
assertion uses the actual compiler graph, not a source-import occurrence count.
The staff route requires only enqueueRetailOpsStaffInviteNotification.

The jobs package now exposes /staff-invitations. That entry imports the matching
notification dispatch handler for the existing local background fallback, current
trigger transport, and shared pure job IDs. It never imports the worker registry.
The old root reexports the same function and IDs, preserving existing callers.
Only the demonstrated Dashboard caller and its test transport mock change paths.
The original producer function and entire job ID object are byte-identical moves.
No payload/recipient/command, queue configuration, retry/idempotency or provider
policy is rewritten to make the import graph smaller.

With identical offline Bun options the producer graph becomes218 modules and0
unrelated workers; output16565252→14334262 bytes. This is an unminified compiler
output with fixed external libraries, not browser bytes, memory or speedup/p95.
The actual Next rebuild also passes: its Staff route trace falls1715→274 files,
with repository source references1360→47. Both whole-project warnings disappear
without changing private-media code or adding ignores/exclusions. Compile8.8s and
TypeScript31s follow the earlier warmed build, so those wall-clock differences
are not a causal speedup claim. Traced-file reduction is the verified outcome.
Midday job-client's producer boundary and package export conventions were inspected;
EwaTrade retains its matching-handler fallback and existing job package authority.

## Verification and candidate preservation

- Producer3/10: actual public export, job/handler/payload identity, enqueue error
  propagation and actual compiler dependency exclusion. No socket/provider call.
- Existing Staff HTTP route10/24: same QA link/no-store/redaction, Production/live
  token suppression, role/Store access/refusal and command argument behavior.
  Transport-port mock points to the new export. A test-only response guard now
  rejects undefined responses; this fixes pre-existing strict-test-graph narrowing
  errors rather than changing HTTP behavior. No actual invite is submitted.
- Original enqueue body/job IDs match their pre-change text hashes. Current
  optimized baseline15489 runtime files and older prepared3cf runtime files are
  archived privately with manifest checks. Development output lives separately;
  installed Next build cleanup explicitly preserves dev. No worktree or alternate
  checkout/launcher/config is introduced. Build-generated next-env changes are
  restored only to their exact captured original development references.
- Full optimized Dashboard build/type stage passes; API production plus owned
  jobs/Staff-test graph also passes. New Bun test drops an unsupported write option;
  without outdir its output stays in memory. Producer3/10 and Staff10/24 rerun pass.
  Owned fast237/1533, QA tooling types/Biome and H01 current/H02 client/domain with
 0capability/0procedure changes pass. Later changes only narrow test types, whose
  focused checks and formatting pass separately; production source is unchanged.
- Final frozen-source canonical existing-data local smoke passes, receipt copied
  before documentation changes. RuntimeVerified:false remains development evidence,
  not an optimized identity/latency acceptance. Existing QA selection, populated
  Catalog, draft item/total and cancellation pass without business submission.
  Existing unrelated UI/permission evidence is reused for unchanged boundaries.
- All five compiled product-file mtimes predate the completed build's start;
  current product/lock hashes and four optimized manifests are pinned. Source
  commit is recorded after the local commit. Development output/types stay intact.
  Prepared optimized build has not been served or timed. A Dashboard-only switch
  and restoration needs coordination; the earlier965 window already finished.
  Current candidate supersedes the old unexecuted3cf timing request, whose runtime
  archive remains intact. No old approval is reused for this candidate.

Existing Next middleware deprecation and Node localstorage warnings are disclosed;
no warning is suppressed to manufacture success. No unsafe tracer ignore/comment,
path restriction or test-adapter behavior change is used. Broader API producers
and other hot import graphs remain DP-302 work; this slice does not close a family.

Private evidence: /tmp/ewatrade-dashboard-program-20261029/staff-imports-* and
optimized-current-* / optimized-15489-baseline / optimized-3cf-preserved.
Brain: project/task/navigation/staff feature pointers and existing jobs-boundary
ADR clarification. No API/permission/schema/relationship/migration change is needed.

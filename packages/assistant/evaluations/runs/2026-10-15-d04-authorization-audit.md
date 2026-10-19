# D04 authorization fingerprint audit — 15 October 2026

Source and retained local evidence review only. **The historical mismatch remains
unattributed. The twelve conditional signed cases remain UNSCHEDULED.** No
connected verifier, database client, network request, authorization/grant change,
capability visibility change, runtime restart or provider action ran in this audit.
Assistant milestone acceptance remains **13/45 (28.9%)**; D04 remains partial.

## Checklist and conclusion

- [x] Inspect actual failed signed evidence and the later read-only observation.
- [x] Trace current full-row fingerprint and separate diagnostic fields.
- [x] Trace direct canonical revalidation, derived-session validation and UI callers.
- [x] Reproduce the actual canonical helper's timestamp write using only inert
  in-memory delegates: **3 tests / 13 assertions pass**.
- [ ] Identify the historical changed authorization row, field and writer.
- [ ] Resolve preservation failure with attributable evidence reviewed by coordinator.
- [ ] Schedule or execute remaining twelve cases: **not authorized by this report**.

The failure is not a proven proposal token/revision defect, grant mutation, or
service-intake write escaping rollback. Current source contains a canonical
validation path capable of changing the full authorization fingerprint without
changing the row count. Available evidence cannot establish that this path caused
the historical failure, and no source repair is justified by that hypothesis alone.

## Expected versus observed evidence

The preserved ignored evidence is
`artifacts/assistant-operations-parallel/D04/signed-rollback-failure.v2.json`.
Its failed `completion-replay` case reports deliberate rollback true, saved-state
preservation false, elapsed 19,820ms, and 134 before/after fingerprint entries.
Only this entry differs:

| Entry | Before | After |
| --- | --- | --- |
| Table | `D04:QaClientAuthorization` | same |
| Row count | 64 | 64 |
| Full aggregate MD5 | `dd62ed5f4d194722dc4d5110b2459d71` | `4b7b20ba9e6a747859b7a966fda5cbc2` |
| Per-row diagnostics present | none | none |

The expected invariant is exact equality of both count and full-row hash after
rollback, including validation timestamps. `edit-confirm` is the sole completed
case and retained identical hashes. `completion-replay` reached its native
receipt/atomic-completion/fresh-authority replay assertions but failed the
post-rollback invariant; eleven later cases were not reached. Thus twelve cases
remain conditional (failed case plus eleven unrun), not eleven.

The later ignored `qa-authorization-snapshot-pair.v1.json` has two 134-entry
READ ONLY/RepeatableRead snapshots, each containing 64 authorization diagnostic
rows. Its aggregate is `9a585d556a372f592faed64279639124` on both sides; changed
rows/tables are empty. It started 2026-10-12T10:16:10.622Z, took 28,693ms including
a 20-second gap, and explicitly records `historicalAttribution: false` and
`classification: no-change-in-this-window`. Its later, different baseline cannot
reconstruct the missing historical before/after rows or identify their writer.

The tracked checkpoint
`2026-10-12-saved-chat-and-signed-intake-checkpoint.md` also records a separate
browser continuity attempt whose only changed aggregate was the same global
QaClientAuthorization table. This corroborates reproducibility of the observation
category, not attribution of either historical event.

## What the current fingerprint actually covers

`apps/api/src/assistant/service-intake-signed-rollback-facts.ts:120–146` reads the
shared facts and global `D04:` table facts. The authorization aggregate has **no
Tenant/Store/session filter**: it covers every saved QaClientAuthorization row.
Any writer for another QA client can therefore break preservation even when all
Tenant service rows roll back correctly. That global scope is intentional and
remains unchanged.

The aggregate hashes ordered `to_jsonb(r)` for every whole row, with `[]` for
empty tables. Current scalar columns from
`packages/db/prisma/models/base.prisma:251` are:

`id`, `grantId`, `clientId`, `clientPlatform`, `tokenDigest`, `status`,
`expiresAt`, `revokedAt`, `lastValidatedAt`, `createdAt`, `updatedAt`.

Per-row diagnostics, added after the failed run, retain safe row `id`, full-row
`hash`, `stableFieldsHash`, `lastValidatedAt`, `updatedAt`, `status`, `revokedAt`
and `expiresAt`. The stable hash subtracts only `lastValidatedAt` and `updatedAt`
**for attribution**, not for acceptance. Neither token/client/grant digest nor
credential content is returned. `assertServiceIntakeSignedFactsUnchanged` aliases
`assertG02FactsUnchanged`, which still checks full `rows` and `hash`; the root
post-rollback case comparison supplies no allowed-table exclusions. Current
`nativeEffects` excludes no authorization tables. Timestamp-only drift still
fails. The existing signed harness test explicitly preserves that behavior.

## Grant, session, revision and writer trace

1. **Explicit QA authorization validation:**
   `packages/db/src/queries/qa-access.ts:466–505` hashes the supplied token using
   HMAC-SHA256 with purpose `client-authorization`, reads its authorization and
   grant, checks both ACTIVE/unrevoked/unexpired, then unconditionally updates
   `lastValidatedAt` on that exact row through its supplied client. Prisma marks
   `updatedAt` with `@updatedAt`; a real Prisma update also updates that column.
   No grant status, expiration or token rotation occurs in this validation branch.
   An unchanged row count is compatible with this write.
2. **Real callers capable of concurrent validation:**
   `packages/onboarding/src/components/qa/qa-web-accelerator.tsx:158–205` calls the
   web revalidate route while authorized every 60seconds, on window focus and when
   visibility becomes visible. The route delegates through
   `packages/onboarding/src/lib/qa-access-server.ts:264` to the canonical helper
   using root Prisma. Mobile `use-qa-accelerator.tsx:117` also revalidates every
   60seconds through `qaAccess.revalidate`; the API router delegates to the same
   helper. If such a caller ran within the historical preservation window, its
   committed write could survive the verifier's separate rollback transaction.
   **This is an inference about a possible mechanism, not proof it ran then.**
3. **Derived-session validation is a different helper:**
   `validateQaDerivedSession` reads the Session's linked authorization/grant and
   current QA membership/Store. An active valid session returns scope without
   writing authorization timestamps. An invalid one deletes that Session. Do not
   attribute the timestamp write to every normal authenticated request: HTTP
   context uses this derived-session helper for `qas_` tokens, whereas explicit
   accelerator revalidation uses the writer above.
4. **Signed runner and fresh proposal authority:** the preserved runner constructs
   its direct context from the pinned existing Session and current Owner/Store;
   it does not execute the web revalidate route. Current
   `general-proposals.ts:90–163` locks current membership, verifies an existing
   unexpired browser Session, re-resolves tenant/staff scope and account/legal
   access before the canonical action. The fixture uses its caller's transaction
   for catalog/service/customer rows, and explicit refusal cases temporarily
   suspend membership or expire a Session inside that transaction. No direct
   QaClientAuthorization update appears in these inspected fixture/dispatcher
   paths. This is source tracing, not proof of all historical runtime writers.
5. **Revisions and hashes are distinct:** the proposal binding includes proposal
   revision, payloadHash, exact actor/Tenant/Store and expiry in its signed HMAC;
   the service-intake target revision fingerprints input/current actor/customer/
   assignee/review/Offerings/settings. The global authorization preservation MD5
   is separate. QaClientAuthorization has no revision column. None of those facts
   identifies which global auth row or column changed after the historical case.

Other canonical authorization writers exist (authorization exchange/upsert and
revocation). They change additional fields and often audit/session effects. The
original aggregate-only evidence cannot rule out those writers or another
out-of-process database writer merely because timestamp validation is plausible.

## Bounded inert reproduction and its limits

New fixture:
`packages/assistant/evaluations/fixtures/d04-authorization-inert.fixture.ts`.

Executed once with:

```sh
bun --env-file=/dev/null test ./packages/assistant/evaluations/fixtures/d04-authorization-inert.fixture.ts
```

Result: **3 pass / 13 assertions**, scoped Biome passes. It imports the actual
canonical `revalidateQaClientAuthorization` and `validateQaDerivedSession` helpers,
uses fixed synthetic identities/expiry and an inert literal initializer, and
supplies only in-memory delegates. It imports no Prisma singleton or environment
profile and makes no request. It proves that explicit successful revalidation
issues exactly one update containing `lastValidatedAt`, that active derived-session
validation issues no authorization update, and revoked authority refuses validation.

It does not run PostgreSQL, emulate Prisma `@updatedAt`, reproduce SQL jsonb hashes,
commit or roll back a real transaction, identify a historical row/writer, validate
current grants, or prove D04 preservation. The existing full hash assertion was
not changed or bypassed. No signing material or capability was enabled.

## Exact missing evidence and next safe handoff

Historical attribution requires the failing window's per-row before/after full
and stable-field hashes plus safe timestamps/status/expiry and writer/request
correlation. The original v2 artifact does not contain those rows; later unchanged
snapshots cannot recover them. Correlated retained API/proxy/database audit logs
could establish a timestamp validation writer only if they identify its actual
window and affected row. Such logs have not been supplied or proven here.

The coordinator can review retained logs without changing the gate. Any new
connected observation or remaining-case attempt needs its own bounded approved
slot and current-source/scope review; this report schedules none. Preserve every
whole-row fingerprint, including validation timestamps, and record any future
mismatch as a failure with attributable safe diagnostics. Do not exclude columns,
repair shared grants, reuse persistent fixtures, bypass planned visibility or
increase transaction limits to produce a pass.

## Inspected source/evidence SHA-256

| Path | SHA-256 |
| --- | --- |
| `apps/api/src/assistant/general-service-intake-signed.integration-check.ts` | `95de5ebe43f6c6ea0fffc92e32a5479bea8eb9f5eb9f26542984663304756c96` |
| `apps/api/src/assistant/service-intake-signed-rollback-facts.ts` | `1ac3c1542d6248b86d93c59581aab82f450a3ea9a028898572262ad5d42b306d` |
| `apps/api/src/assistant/service-intake-signed-rollback-cases.ts` | `136339dc0f0547ff244565075678c6c9681a9e48c873863f33e8305169366705` |
| `apps/api/src/assistant/general-proposals.ts` | `163387eb20857fa5ee07468af0c7407cd7189c621a9554d98b38a83b225d724a` |
| `packages/db/src/queries/qa-access.ts` | `f5b01382b259440e22e88f1261126af837b8886b7c5227e610d33004b2911fc2` |
| `packages/db/prisma/models/base.prisma` | `044a0958491a30c899e4eee0ae89cec3790f725d6560d8a4eb8ebd2b1cfdd7a3` |
| ignored `D04/signed-rollback-failure.v2.json` | `b629c63237e6a59e2ed015cb910390c5316374a830ba3d4587fc8a62559284a8` |
| ignored `D04/qa-authorization-snapshot-pair.v1.json` | `854955b07856426d9c2bf36cea7eefdda5b1fea5896e5d40b4c7a1437677e424` |

Brain impact: root acceptance coordinator should link this audit in Phase7/QA
and retain the unresolved blocker and all twelve unscheduled cases. This subtask
changes only the new report and inert fixture; no merchant behavior, schema,
authority or rollout change requires product documentation claims.

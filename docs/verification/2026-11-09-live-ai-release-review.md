# Live AI adult-access source review — 9 November 2026

Status: the identified P2 is addressed in218c92cca and independently reviewed;
the test-evidence caveat was corrected in d47fa9911.
This is a source review,
not hosted/native acceptance or a change to effective legal terms. Production
remains b0 at this checkpoint; Apple2/6 and Android1/8 are unchanged.

## Fixed candidate and review method

Reviewed exactly:

```text
git diff e82bcb9552c99785a23aced35fec35607e30ae53...d13bc50f9d0f490e0671c5ee41058d36ec8a81cf
d13bc50f9 feat(ai): require adult declarations for live generation
```

The code-review skill's independent Standards and Spec reviewers inspected this
pinned diff without edits, provider calls or repeated tests. Their reports remain
separate. Coordinator checked the concrete refusal path against the same source.
Moving HEAD and unrelated Studio preview behavior are outside the candidate.

Standards sources: root AGENTS.md and local Brain engineering standards/rules.
Spec sources: local Brain feature `live-ai-adult-access.md`, the approved
`2026-11-09-live-ai-adult-launch-access.md` decision and the
[source receipt](2026-11-09-live-ai-adult-access.md).
The owner approved live AI for accounts declaring18+, while preserving eligible13+
ordinary functions/history. No guardian system, provider contact or global18+
account rule was authorized. Automatic safety screening is a separate disclosed
terms/payload review; no consent exception is inferred.

## Standards

Documented-standard violations: **none found**. DB repositories retain current
account authority; API/jobs compose that check through a shared provider transport.
Existing focused/type/impact evidence was reused, without another test run.

Judgment call — possible **Duplicated Code**, nonblocking: pinned
`apps/api/src/assistant/model-resolution.ts:52` and
`apps/api/src/assistant/live-ai-access.ts:11` independently translate
`AssistantLiveAiAccessError` into `TRPCError(FORBIDDEN)`. A shared API translation
helper could prevent later inconsistency. This is a maintenance suggestion,
not a demonstrated behavior defect or required release refactor.

## Spec

**Original P2 — preserve deliberate age refusal on Setup/Product HTTP routes.**
The source receipt requires missing/deleted/undeclared/teen accounts to refuse,
with ordinary setup preserved. The new resolver throws `TRPCError(FORBIDDEN)` at
pinned `model-resolution.ts:56–61`. It escapes `workflow-turn.ts:223`, while
`chat-route.ts:159–160` handles only `WorkflowTurnError`. The global
`apps/api/src/index.ts:286–303` consequently returns500. Dispatch still fails
closed, but the user receives an operational error instead of deliberate403 and
adult-access guidance. General chat already handles `TRPCError` separately.

Original author owns the focused correction in chat-route and its actual handler
test. Required regression: deliberate403/adult guidance and zero model dispatch,
while unrelated failures and existing permission behavior remain unchanged.
The uncorrected d13 candidate was held from deployment pending this follow-up.

No enforcement bypass or unrequested scope creep was found. Fresh actor reads,
SDK retry/fallback guards, Storefront zero-token versus unknown-outcome handling,
provider-free anonymous help and preserved manual/history paths appear aligned.
This does not certify every provider path or resolve disclosed policy gaps.

## Follow-up and release boundary

Follow-up `218c92cca` maps nonserver TRPC refusals through the existing route
failure envelope. Unexpected/internal errors still propagate to the sanitized
global500 handler, and WorkflowTurnError/Retry-After behavior is retained.
Coordinator and the independent Spec reviewer inspected exactly the two runtime/
test paths in `git diff d13bc50f9...218c92cca`; the intervening commit is docs-only.
The original P2 is addressed; no new concrete implementation issue was found.

The meaningful Hono POST regression uses the actual workflow/default resolver
and canonical age checker for Setup/Product crossed with both teen bands,
undeclared and missing accounts. It asserts403, fixed guidance, no-store and
zero configuration/run/budget/draft writes. The author demonstrated red500 before
the fix and green403 afterward. Focused route/resolver29tests/169assertions pass,
with1real-provider test skipped; scoped284/1813, QA types/Biome, full API types
and H02 pass, unchanged H01 reused. Reviewing chat did not repeat those tests.

Evidence follow-up: the original single guard-acquire assertion did not prove
lease release with the default concurrency limit2. After this was flagged, the
author configured the existing regression with a single concurrency slot in
`d47fa9911`, so a leaked lease now makes its post-refusal acquire fail. The named
regression passes1test/64assertions and Biome passes; no app behavior changed or
broad test matrix was repeated. Coordinator inspected the exact guard-config
delta. The original caveat remains historical, not an outstanding claim of proof.

The receipt's two Studio preview failures were reproduced on the prior source;
the narrower owned Storefront subset passes. Keep the full-suite limitation
visible. Automatic moderation of ordinary13+ and anonymous inputs, actual provider
account/recipient/retention facts, geography controls and final legal publication
remain separate acceptance work. This review does not approve provider outreach,
new settings, builds, deployment or disclosure of customer data.

Summary: Standards0hard violations/1nonblocking duplication suggestion;
Spec1P2 identified and addressed,0unresolved findings in the reviewed follow-up.
No ranking across the two axes is implied.

Brain impact: the local task-handoff note records the pinned review, ownership
and blocking follow-up. No application code, API, schema or authority was changed
by the reviewing chat.

Review-document verification: explicit one-document fast plan has no unknown
paths; the core smoke passes51tests/254assertions plus QA tooling types. Source
checks above are reused with their candidate/scope limits. Local links and
whitespace pass; no hosted/provider/native acceptance is implied.

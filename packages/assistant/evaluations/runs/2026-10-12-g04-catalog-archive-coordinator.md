# G04 catalog archive — coordinator review and repair verification

12 October 2026. Source reviewed in the shared working tree. G04 remains
partial/planned/unaccepted; roadmap 13/45 accepted (28.9%).

The initial packet had two independently reproduced review/edit defects:

1. A DRAFT unit remaining after archiving the only ACTIVE unit was counted as
   "Still for sale afterwards: 1 selling unit(s)." Ordinary order resolution
   requires ACTIVE offerings; progressive attestation can deliberately permit
   DRAFT. The review cannot equate non-ARCHIVED with currently for sale, or infer
   Store availability without reading it. An initial recommendation about parent
   status was corrected in the chat: no new parent-status policy is authorized.
2. A variant and its own offering could be selected together. Removing that
   offering through Keep selling left the variant target, which would still
   archive it. Authoritative review must reject overlap or normalize edit
   semantics coherently.

Claude repaired the dedicated adapter and test. Root verified frozen hashes:
- apps/api/src/assistant/general-catalog-archive.ts:
  fb68a78d239cb4a8475b7ad0c8a46cb488235bdadcaabd2a4b9fe2d0d2d8e871
- apps/api/src/assistant/general-catalog-archive.test.ts:
  33153ca32d12d90793220a4b9af3aff4676abf60f2e2d2d2658c8144b25d7690

Current review reports ACTIVE units and DRAFT leftovers separately, makes no
Store-availability claim, and refuses variant/child overlap before draft saving.
The completion receipt uses an explicit remainingSummary instead of a positional
line lookup. Root contract+adapter run: 9 pass, 23 assertions; Biome clean on both
repaired files. Initial F01/G04 focused baseline: 14 pass, 73 assertions.

Diagnostic: packages/assistant/evaluations/fixtures/collection-catalog-review.fixture.mjs.
Run with an unreachable placeholder EWATRADE_DATABASE_URL and Bun's
--env-file=/dev/null. All inputs/query contexts are synthetic; no connected
database, provider, merchant setting or catalog write occurred.

Remaining: signed confirmation/current authority and reservation-concurrency
proof, immutable original receipt, saved dashboard/native Open/Close and role
journeys. Source fixes are not parent acceptance or native parity. Claude owns
S05 original-event Open next, then the expanded G05 fixture; shared-path changes
need explicit path coordination. No product implementation was committed by root
as part of this review checkpoint.

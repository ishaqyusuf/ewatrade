# H05 rollback readiness source review — acceptance open

Reviewed the authority/rollout split, proposal decision order, paused projection
and the new two-case rollback test. The implementation agent reports six passing
cases across the new file and existing rollout/refund checks; these were reused.
No connected suite, manifest toggle, provider action or release occurred.

The inspected source retains fresh transactional session/Tenant/Store/actor and
membership checks. Completed-confirm replay and cancelled-cancel replay use
authority without rollout; pending confirmation still requires rollout before
approval and execution. Pending cancellation keeps compare-and-set semantics.
Pending rolled-back projection removes approval and avoids adapter review.
Client confirmation guards require a token; disabled UI is not a new grant.

The new tests exercise the assertion split and paused pending DTO, not the actual
`decideGeneralProposal` replay/cancel branches. A connected or suitably isolated
production-path check must still prove completed receipt replay, pending
cancellation, no duplicate effect, and fresh revoked role/Store/session refusal
after rollback. The unchanged integration suite has not been run for this packet.
Saved original objects and mobile/dashboard return journeys remain UI gates.

The owner previously removed runtime switches/allowlists. This source does not
reintroduce them; the proposed Preview-as-canary approach remains a proposal.
The H05 parent requires phase acceptance, approved canary/rollback, observed
errors, deployed version/inventory and actual expansion evidence. Documentation
and source helpers alone do not complete those requirements.

Shared-file ownership needs care: current `general-proposals.ts` also contains
another packet's review-presentation changes. Freeze and identify exact reviewed
H05 hunks before serialized main integration; do not include unrelated live edits
merely because they share the file. No runtime rollout is certified.

H05 stays partial without an accepted bookmark; 13/45 web acceptance unchanged.

## Isolated decision-path evidence — 12 October 2026

The earlier production-path gap is now covered within an isolated fixture:
[actual decision fixture](../fixtures/rollback-recovery.production-path.fixture.ts).
Its explicit standalone run passed **8 cases, 29 assertions, 0 failures**:

```sh
APP_ENV=local NODE_ENV=test \
EWATRADE_DATABASE_URL='postgresql://probe:probe@127.0.0.1:1/unreachable' \
ASSISTANT_APPROVAL_SIGNING_KEY='fixture-key-0000000000000000000000' \
bun --env-file=/dev/null test ./packages/assistant/evaluations/fixtures/rollback-recovery.production-path.fixture.ts
```

The key is a synthetic process-only fixture value. Run this file alone: its
module mocks replace the workspace and age database loaders. The transaction
and delegates are synthetic; the actual `decideGeneralProposal`, session/privacy
checks, scope comparison, authority, rollout and decision branches execute.
This does not prove database locks, concurrency, canonical workspace resolution,
persisted recovery, transport behavior or a connected rollback drill.

Verified branches: repeated completed confirmation returns the exact saved
receipt with no write; pending cancellation writes once and its retry returns
the same result; pending confirmation stays forbidden before an effect; fresh
Cashier role, expired session, privacy block, changed Store and revoked scoped
Manager access refuse recovery. Session/privacy/Store/scoped-access cases refuse
before a proposal read. Existing six owner checks and affected-source compiler
evidence are reused rather than repeated.

The three implementation files and owner handoff still match the frozen source
hashes. Review-presentation changes formerly sharing `general-proposals.ts` are
already committed separately in `969ee54d`; its remaining diff is H05 only.
Only the H05 authority hunks of `general-context.ts` belong in this integration;
the live S05 domain entry remains outside it. The impact record now describes
the assistant behavior change explicitly instead of claiming no assistant impact.

The local policy ADR records Preview as the proposed canary and planned-plus-
release as rollback. No deployment, switch, restart or account setting was
executed. Phase acceptance, deployed inventory, observed errors and actual
canary/rollback expansion evidence remain open; H05 is partial and unbookmarked.

Integration checks: the exact 13 staged source/evidence/catalog paths pass the
H02 impact evaluator with **zero errors** against unchanged HEAD/index coverage
(zero capability/procedure row changes). Frozen source hashes match; the S05
shared domain hunk is absent from the index. Staged whitespace checks pass.
The evaluator deliberately excludes unrelated agents' unstaged coverage edits;
this is a packet check, not a hosted CI or whole-worktree acceptance claim.

## Separate saved purchase-card screenshot checkpoint

The actual existing QA assistant chat renders the structured purchase card from
`969ee54d`. Expand shows all ten saved goods rows with their quantities, costs
and **₦10.45** total; folding restores the initial view on the same chat URL.
No send, edit, confirmation or business write occurred. This checks the current
saved purchase presentation, not H05 rollback UI or mobile acceptance.

![Expanded saved purchase review](/Users/M1PRO/Documents/code/ewatrade/artifacts/assistant-operations-parallel/H05/saved-chat-expanded-purchase-review-v1.jpg)

![Folded saved purchase review](/Users/M1PRO/Documents/code/ewatrade/artifacts/assistant-operations-parallel/H05/saved-chat-folded-purchase-review-v1.jpg)

## Existing saved original-object return checkpoint

After H05 source integration, the current QA dashboard's saved chat
`cmv4i45w70000eb9kl7jkfa3e` shows completed proposal
`c8735136-aa7b-42e4-a47b-4931001c8319`. With an empty composer verified, the
coordinator entered a temporary unsent test sentence and selected that card's
**Open Purchase goods received**. The sheet opens over the same assistant URL with
`purchaseRegistration=cmv4hu0jl0001jt9ky6nvnxba` and
`purchaseRegistrationBook=cmv491pwa0000499k783y6lpx`.

The loaded original agreement identifies QA Web Supplier Edited, the ten mixed
goods agreement, **₦10.00** agreed, all ten quantities and costs, and alternating
known/unknown valuation attribution. Its recognition history shows recorded
physical receipt **QA-TEN-LINE-WEB-RECEIPT**, timestamp
`2026-10-09T12:00:00.123Z`. The sheet distinguishes agreement registration from
recognition and does not infer current paid/outstanding money.

Close removes only the object parameters, restoring the exact chat URL and
unchanged unsent test text. The original saved result remains visible and the
allowance remains **99 of 100**. The coordinator then cleared only its own
temporary text, restoring the initially empty composer and disabled Send.
No message, edit, confirmation, provider call or business write was submitted.

This current saved-object continuity check is reusable dashboard evidence. It
does not certify withdrawal of a capability, repeated decision execution,
database effect counts, the deployed source version or native behavior. Do not
rerun this unchanged object path merely to advance the board; perform the actual
remaining rollback/device gates when their prerequisites are available. H05
remains partial/unbookmarked; the board stays 13 web accepted,27 partial,5
unstarted. The existing isolated 8-case result is reused without another run.

![Saved original receipt history over the assistant](/Users/M1PRO/Documents/code/ewatrade/artifacts/assistant-operations-parallel/H05/saved-receipt-history-v1.jpg)

![Close returns to the same chat with its unsent draft](/Users/M1PRO/Documents/code/ewatrade/artifacts/assistant-operations-parallel/H05/saved-receipt-return-draft-v1.jpg)

# Android safety/privacy preparation — 7 November 2026

Source base `db97a0056`, current `main` checkout; no branch/worktree change.
Concurrent `a6780cb6d` records the owner's paid-at-launch correction and is preserved.
Foreign AGENT_CHAT history and staged `docs/explainers/README.md` /
`business-manual-banking.html` remain outside this task's commit.

## Scope and delivered preparation

The owner corrected “free launch” during this review: **not launching free**.
The shared committed correction confirms paid owner subscriptions. No purchase
flag, hosted setting or payment provider was activated. The 6 November plan now
carries a superseding notice from the other chat; historical evidence remains.

Prepared [the Android review packet](../releases/android-safety-privacy-review-2026-11-07.md)
and [unapproved permission wording](../releases/mobile-permissions-disclosure-draft-2026-11-07.md).
Source tracing adds selected Contacts, pre-save phone matching, precise-location
API/Nominatim/Maps destinations, current authenticated analytics and linked IAP
to the handling review. Public Nominatim suitability is a concrete unresolved
decision; no personal coordinates were transmitted in this work.

Reconciled the approved/live October adult-chat publication and completed empty-
data Preview deletion case. The generic hard-stop script remains unchanged;
its broad message does not invalidate the narrower successful legal preflight.
Positive domains, provider/retention operations and current dedicated operator
access still require evidence. No new destructive test, fixture or DB census.

## Verification

- `bun run qa:doctor --offline`: pass; dependency/generated-client presence and
  profile isolation only. No runtime/DB acceptance.
- `bun run test:quick --plan`: inspected before changes; initially selected only
  foreign docs/core. Final owned-doc selection is recorded below.
- `bun --env-file=/dev/null scripts/check-production-legal-live.mjs`: **pass**.
  Existing canonical checker verified approved/effective current source publication,
  matching public pages and available external deletion intake. Public web-search
  fetch of the www URLs failed; the actual repository preflight succeeded. No
  browser/UI acceptance, request submission, mail or account processing inferred.
- `node scripts/check-teen-release-readiness.mjs`: **expected fail**, exit1.
  Signed-path/media/platform/operational release evidence remains open. Not modified.
- Focused source suites: chat eligibility, authoritative age/recipient rechecks,
  scoped report/block/operator review, phone-only deletion and privacy authorization,
  contact-number handling and geocoding. Initial combined invocation omitted the
  test-only DB URL and produced two import errors (36 passed, 2 errors). Corrected
  API-only invocation using the existing quick-runner's inert localhost:1 URL
  passed28tests/87assertions; no database connection. Final combined result below.
- Previous local Android smoke `036aa54d-8ba0-42d3-b1cf-f501e48f91ca` reused only
  for unchanged local free-plan behavior. It is local/dirty/runtime-unverified,
  and cannot qualify paid billing, current signed safety or a Production release.

Final combined source run: **64 pass, 0 fail, 209 assertions** using the inert
test DB URL; no database/provider access. Owned-document fast smoke selected
only the three new packet/wording/receipt paths, excluding foreign work:
**48 pass, 0 fail, 211 assertions**, no unsupported mappings. All relative
document links resolve. Whitespace review passes. No application source or
assistant capability changed, so no new capability snapshot/impact is required.

## Remaining gates and authority

Safety preparation3/4 (75%): inventory, evidence reconciliation and review packet
complete; actual candidate/deployed control/declaration acceptance remains open.
This scoped denominator is not the retired free-launch3/6 or a paid-launch score.
No new signed/store gate closed. No physical/emulator operation was necessary.

No effective legal document edited, store declaration saved, code/provider flag
activated, build uploaded, deployment, push, payment, sale, message or destructive
account action performed. The geocoding choice is pending; do not infer an answer
from elapsed time or a source-only test pass.

Brain impact (local-only): BRAIN.md, tasks/in-progress.md,
features/account-privacy.md and launch/play-data-safety-matrix.md. No schema, API,
permission or assistant capability change; existing guards remain unchanged.

# Staff access draft and registered Job handoff acceptance review

S04 remains partial. Web acceptance is 13/45 (28.9%); mobile acceptance is separate.
This is a review checkpoint, not a completed signed or native acceptance run.

## Focused checks and review findings

The seven new provider-free handoff cases pass (58 assertions). They cover current
factory context, exact cross-Store/archived Job pins, stale and unavailable reads,
scope drift, single-owner release isolation, and nonsubmit workload controls.
They do not exercise the complete mounted form and sheet lifecycle.

Only the changed existing workload case was run. It failed because static HTML
escapes the apostrophe in `assistant&#x27;s`; its expected copy was unescaped.
The worker owns that assertion correction. Earlier unchanged passing cases are
reused; no broad repeat suite was run.

Source review found a revoked-access return trap: GlobalSheets unmounted the Job
sheet when service access became false while the handoff token and Job URL remained.
That could leave the retained Edit draft hidden without a Close action. The worker
is repairing the bounded factory/return behavior and its affected regression.
No acceptance or main commit of that packet was claimed at that checkpoint.

## Frozen repair review

The worker froze 13 exact source/test paths. All final SHA-256 hashes match.
GlobalSheets retains the existing owned Job sheet after access revocation only
when the live handoff matches its open Job URL. Revoked access disables context
reads and prevents native Workspace mounting even with warm cached data; only
the generic unavailable message and Close remain. Ordinary/mismatched Jobs gain
no access, and the services page retains its single sheet owner.

Successful Close awaits removal of only `jobId`/`serviceSheet`, invalidates the
current staff review and releases the exact token. Failed URL cleanup retains
the unavailable sheet, token and Close. The retained editor identity and form
callbacks are unchanged; no Save/cancel/business operation occurs on object Close.

The new isolated wrapper passed, executing three logical production factory/sheet
regressions. It models URL/query/overlay/dismissal/visual boundaries and therefore
does not establish actual mounted form, modal-stack, keyboard or focus continuity.
The single previously failing workload-copy case now passes (7 assertions), while
seven earlier handoff cases (58 assertions) and earlier workload evidence are
reused for unchanged runtime behavior without repeats.

One actual-dashboard compiler with the 13 frozen roots and their real imports
failed only TS2769 in the existing workload fixture's possibly undefined expected
row. The worker added an explicit existence guard for `workload.jobs[3]`; equality
and production code are unchanged. Only that failed compiler reran; session83921
exited0 with an empty log. The first failure and correction are retained. Logs:
`artifacts/assistant-operations-parallel/S04/full-job-review-typecheck.log` and
`full-job-review-typecheck-fixed.log`. No broad/mobile compiler was launched.

## Actual saved-object continuity observation

The existing authenticated bakery QA Owner opened the saved ten-line purchase result
from conversation `cmv4i45w70000eb9kl7jkfa3e`. The registered purchase agreement sheet
displayed the original agreement and recognition history over that same assistant
route. Close removed the two object parameters, preserved the conversation, messages
and exact newly entered unsent QA draft, and returned focus to the result's Open
button. The owned unsent QA text was cleared afterward; no message was sent.

This is actual saved purchase-object navigation evidence. It does not certify S04's
full Job-over-access-editor flow or the foreign in-progress chat-routing changes.
No saved proposal, signed action, business mutation, runtime activation, provider
request, native test, restart, push or deployment occurred.

![Saved purchase object over the assistant](/Users/M1PRO/Documents/code/ewatrade/artifacts/assistant-operations-parallel/S04/saved-chat-receipt-over-assistant-v1.jpg)

![Same conversation and retained unsent draft after Close](/Users/M1PRO/Documents/code/ewatrade/artifacts/assistant-operations-parallel/S04/saved-chat-receipt-return-draft-v1.jpg)

## Remaining acceptance

Review repaired factory behavior, then check actual retained form rows, catalog
choice, starting Store and legacy acknowledgment through full Job Open/Close,
Escape/outside dismissal and focus return. Fresh authority, revoked/switching scope,
double Open, URL failure, cross-Store/archived access and native refresh remain
distinct gates. Signed Save/review/Confirm/recovery/concurrency and mobile parity
remain open. G01 connected QA pause, D04 historical authorization-hash mismatch and
unscheduled cases, and E05 unapproved runtime activation remain unchanged.

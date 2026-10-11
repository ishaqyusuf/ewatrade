# Customer credit proposals and editor — 11 October 2026

Source base: 6585ab1f plus adapter/editor changes in this commit.
Evidence: provider-free source checks and manual component web checks.

Strict apply/release schemas reject client authority, revision, command key and date;
exact positive money capped at canonical transaction limit. Both capabilities remain
planned, Owner/Admin finance-only, dashboard-only. Prepared execution hashes fresh
review, passes server revision/actor/command to canonical caller-owned transaction.
Review and receipt distinguish no collection from no refund. Prompt requires exact
sources and clarification. Allocation-history discovery still needs implementation.

7 focused schema/manifest/coverage tests passed, 40 assertions; scoped API TypeScript
passed. Initial coverage check failed because generated table was stale; regenerated
and rerun passed. No production build, deployment or live model run.

Temporary /credit-editor-qa rendered the actual shared editor. Zero refused; apply
0.01 saved exact minor amount 1; blank release reason refused; release 3.50 saved
350 with reason and preserved source IDs. Cancel invoked without saving. Generic
blank-reason schema message improved to actionable text. Component screenshots:
artifacts/assistant-operations-web/e02-credit-apply-editor.jpg and
e02-credit-release-editor.jpg. Harness retained locally; temporary route/tab removed.

This does not prove normal chat draft/review/confirm persistence, database financial
effects, replay under contention or model source selection. Those remain pending.

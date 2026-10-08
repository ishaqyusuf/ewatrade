# AI Setup Assistant release — 8 October 2026

Candidate: PR #56 (`feat/setup-add-side`). Owner authorized closing the remaining
checks and the Production rollout on 8 October. Dashboard-first, text-only; media
remains disabled. General/native assistants are outside this release.

## Release fixes and validation

- Ported the iOS packet's complete 13-category moderation validation and explicit
  Production approval-reference requirement. QA fixtures cannot run in Production.
- Reset the conversation-reopen guard between visits and close a failed reopen so
  it can be retried. Repeated Done for now / reopen no longer remains on a skeleton.
- Focused final tests: 169 pass / 23 opt-in live skipped / 0 fail (556 assertions).
  Earlier operations/private-media/DB subset: 170 pass / 23 skipped / 0 fail.
- Full typecheck after the fixes: 28/28 successful. Changed code passes Biome.
- Prior live prompt v9 fixtures: 20/20. Farm/laundry complete-setup measurements
  passed twice; budget is 60 turns / 1M tokens per business per 30 days.
- Read-only Production schema diff is additive: attachment enums/table, budget and
  usage fields, optional runId, MONEY_ACCOUNT, draft areas. No data drops.

## Current gates

- Hosted Preview QA selector requested by the owner; Preview-only configuration
  prepared with QA domain routing, server secret and exact origin allowlist.
- Keyboard walkthrough and non-QA Terms prerequisite live check remain open.
- Development migrate refused drift from concurrent lead-signup and sales-rep
  changes (`20261007120000_lead_capture_signup`,
  `20261008091528_sales_rep_order_visibility`). No reset or destructive push ran.
- Production API provider credentials/settings prepared, assistant flag false.
  OpenAI moderation approval is recorded in the existing operating policy.
- PR merge, Production schema push/release and live activation remain pending.

Do not infer Production release from green Preview builds. The current release
record lives in `.brain/plans/2026-10-06-ai-setup-assistant-and-assistant-platform.md`
and `.brain/qa/2026-10-07-setup-assistant-mvp-acceptance.md`.

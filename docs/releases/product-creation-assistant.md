# Persistent assistant and product creation

Prepared 9 October 2026 from `codex/product-creation-assistant`, code commit
`1bb762cb`. The guarded Production schema push and configured Production Vercel
build passed. Application rollout and Production acceptance remain pending.

## What owners and admins can do

- Use Enter to add another line in setup and product chat; the Send button submits.
- Open Add product immediately in its sheet, with a form or chat skeleton while
  content loads. Loading retains the Close and Back to form controls.
- Open the permanent **AI assistant** destination at `/assistant`, including after
  the business has Catalog items or orders. The existing assistant capability
  flag and OWNER/ADMIN role control access.
- Start from Overview, Catalog, the assistant destination or **Create with AI**
  in the Add product form. Describe one product, correct its draft in chat, then
  review and press **Create product** to save it. Typed agreement does not create
  a record. Similar existing products require an explicit separate-product choice.
- Resume an unfinished product conversation and return with **Back to form**.
  Handoff, reload and browser history preserve the complete saved form snapshot,
  including Store, stock, category, illustration, existing private photo references,
  SKU, barcode, selling units and variants. Advanced configurations use the
  ordinary form; manual creation completes the same conversation.
- Read the business AI allowance in Billing and the assistant: tokens used and
  remaining, messages remaining and the reset date. It shares the existing SETUP
  budget of 1,000,000 tokens and 60 messages per rolling 30-day window. Reading
  usage does not start or reset a window. Expired or unstarted windows show the
  available allowance; the next message starts the next window.

The release covers the web dashboard. Mobile remains deferred, and new chat media
remains disabled. Existing form photo handling retains its own gates. Quota or
provider failures preserve the draft and ordinary form fallback.

## Contributor contracts

`productAssistant` exposes `capabilities`, `start`, `state`, `updateSnapshot`,
`create` and `createFromForm`. Conversations belong to the actor, business and
active Store. Start accepts a UUID handoff identity and a bounded form snapshot;
repeating the same handoff resumes its conversation, while changed payloads
conflict. Updates and creation require the reviewed revision.

Stored `PRODUCT_CREATE` purpose selects product-only instructions and tools on the
existing assistant chat route. The model stages one product and has no record
creation tool. Creation rechecks authority and serializes with turn admission;
the canonical Catalog command, committed receipt and conversation completion
share one transaction. Repeated create requests return that receipt. Orphaned
turns have bounded recovery, and obsolete turns cannot persist later changes.

Prisma adds `AssistantConversationPurpose.PRODUCT_CREATE` and nullable
`AssistantConversation.workflowContext`. The generated migration
`20261009092723_product_creation_assistant` also reconciles the already tracked
`ProductAnalyticsEvent` model for fresh databases. That table already exists in
Production; the fresh Production schema diff required only the new enum value
and nullable column. Required local migrate/push passed on the isolated Neon
Development database, and the guarded Production schema push passed. Database
commands retain the repository's profile isolation and Prisma safeguards. These
facts do not certify the historical migration ledger or application rollout.

## Validation and remaining acceptance

- Combined regression suite: 163 passed, 23 optional live-provider tests skipped,
  585 assertions. Real isolated Neon integration: six passed, 107 assertions,
  including rollback, recovery and stale-turn fences. Focused unit checks include
  eight passing cases for handback and reordered selling-unit identifiers.
- Three app-association regression tests pass. Full Dashboard build, standalone
  Dashboard/API typechecks, API production bundle, 33 changed-file Biome checks,
  whitespace checks and the configured Production Vercel build pass.
- Provider-free browser QA covers chat correction, explicit creation, receipt
  navigation, permanent assistant access, form handoff/reload/browser Back, advanced
  manual creation, the 390 × 844 layout, and Billing allowance/reset display.
- QA photo upload refused live-provider access without losing the selected file.
  Persisted private photo references and atomic rollback are covered by contracts
  and real database fixtures. Actual provider photo upload is not claimed.

Application rollout uses the current root `bun release` entrypoint with the
explicitly selected target. Production deployment and authenticated acceptance
must be recorded after rollout. Passing builds, database preparation and
provider-free QA alone do not establish a live application release.

Canonical implementation, roadmap and live evidence remain in local Brain:
[feature](../../.brain/features/product-creation-assistant.md),
[implementation contract](../../.brain/plans/2026-10-09-product-assistant-migration-contract.md),
and [decision](../../.brain/decisions/2026-10-09-focused-product-assistant.md).
Brain and local QA/design artifacts are intentionally excluded from Git.

Loading recovery: terminal missing/access errors stop retries and polling, display their message and retain Back to form. Closing or returning while admission is pending invalidates that handoff; a late response cannot navigate the dismissed editor. Browser error recovery and cancellation passed.

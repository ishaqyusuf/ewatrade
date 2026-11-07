# Shared mobile recipient and retention reconciliation

7 November 2026. Source anchor `d01fae2c83b1b4ea6c859169cdbba5da47bc62ef`,
current main checkout. Android coordinator owns this documentation slice; Apple
owns notification/reviewer/native acceptance and the shared phase index.

## Delivered

- Expanded the existing safety/privacy packet with source-backed billing, text,
  moderation, image, speech, original-storage and separate generation paths.
- Extended the existing shared unapproved disclosure draft; no duplicate legal
  publication or provider catalog. Corrected the stale Nigeria-only/native
  geocoding decision text while retaining dated source history.
- Identified the audio worker's Whisper/OpenAI/xAI fallback, private Blob originals,
  30-day attachment timestamps, bounded cleanup and separate 90-day attempt-row
  selection. These are implementation facts, not hosted erasure promises.
- Reconciled account-linked billing digests and separate encrypted Play refund
  custody. Positive owner billing/coverage must not pass empty-data deletion
  certification; original no-data proof is not expanded.

## Target observation

Used the existing `scripts/assistant-runtime-switch.ts status` through
`scripts/with-workspace-env.mjs DEV_PROFILE=prod REQUIRE_PROD_DATABASE_URL=1`.
This is the canonical profile's database identity, not a certification that every
deployed runtime uses it. The status command performs two exact-key reads and no
writes. A private wrapper captured raw output and emitted only allowlisted
selection metadata. Initial output distinguished neither missing nor invalid
configuration; one follow-up read established **stored selection absent**.
Four exact-key reads total, zero business/customer-table queries or mutations.
The selected local Production profile resolved DeepSeek `deepseek-flash`; actual
hosted environment selection/credential availability remains unverified. No
model/provider request, audio/image upload, fixture, deletion or email occurred.

The status command's old QA comment was not used as authority: actual
`model-resolution.ts` permits the existing DeepSeek text QA exception; the media
worker uses rehearsal adapters. No command other than `status` was invoked.

## Validation and limits

- Offline QA doctor: pass; database isolation checked without connecting at that
  stage. No runtime service was started/restarted.
- Fast source plan: four owned documentation/log paths map to core only,
  `unknown: []`. Scoped source smoke: **48 tests / 211 assertions, zero failures**;
  QA tooling types pass. This checks documentation workflow, not product/provider
  behavior; existing source/native evidence is reused for unchanged code.
- Source references were read directly, including worker overrides and the
  actual cleared fields rather than relying on adapter/comment summaries.
- `git diff --check` passes. Local Markdown link check passes for all three owned
  documents. No runtime UI was exercised for this documentation change.
- No product code/schema change, migration, legal approval/digest update,
  provider configuration, store submission, push or deployment.

Brain impact: local-only `.brain/features/account-privacy.md` and
`.brain/tasks/in-progress.md` point to this audit and its remaining target holds.
Do not force-add Brain. The single launch index retains decisions and ownership.
Android 1/8 and Apple 2/6 acceptance remain unchanged by this audit.

Next evidence owner: Apple/Android coordinate actual hosted non-secret provider
resolution and jobs/gateway configuration, positive paid-owner privacy procedure
and final legal snapshot. Do not request settled launch/payment/geography choices
again or infer legal approval from the instruction to advance automatically.

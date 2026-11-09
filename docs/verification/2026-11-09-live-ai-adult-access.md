# Adult access for live AI — 9 November 2026

Owner-approved source change: user-invoked live AI requires the current account's
server-side `ADULT` declaration (18+). Eligible 13+ accounts retain ordinary
business tools and saved history. This is declaration-based admission, not verified
age assurance. No guardian-consent system, new provider agreement or provider
contact is introduced. The [territory adjustment](2026-11-09-play-provider-territory-adjustment.md)
is a separately saved draft configuration.

## Source behavior

`requireAdultLiveAiAccount` reads only the actual actor's current `User.ageBand`.
Missing, deleted, undeclared and teen accounts refuse; client age headers and
queued age snapshots are not authority. Existing role, Store, privacy, lease,
budget and business-coverage rules remain independent prerequisites.

- Setup, Product, General and linked WhatsApp model resolution check the actor
  before creating a live model. Each SDK fetch checks again, including new tool
  steps and retries. Explicit provider-free non-Production rehearsal remains
  available; actual DeepSeek QA text uses the adult rule.
- Setup opening/welcome uses the existing deterministic template when adult
  admission refuses, so ordinary setup remains usable.
- AI customer-message drafting checks the current actor before provider use.
  Existing manual templates, edits and saved history use their normal authority.
- Queued live image analysis and audio transcription check current age before
  adapter creation and every outbound request/fallback. Age refusal is terminal,
  not a provider-outage retry. Lease/role/source checks still run. QA rehearsal,
  local file extraction and unanalysed General-chat photo attachments retain
  their provider-free paths.
- Storefront design/content generation refuses new nonadult intents before
  reserving allowance, checks queued work before the provider-start marker, and
  checks the actual provider fetch again. A known no-call refusal settles zero
  tokens through the existing usage mechanism. A late refusal after the provider-start
  marker retains unknown-outcome custody rather than erasing possible earlier
  attempt usage. Saved results, idempotent replays,
  ordinary draft edits and history remain readable under existing permissions.
- Anonymous public website help has no authenticated adult authority, so it
  returns authored feature, pricing and registration guidance without a model
  or database call. Existing registration controls and their 13+ choices remain;
  the panel explains that live AI requires an 18+ account. No layout, navigation,
  registration protocol or signup write changed.

Automatic safety screening for ordinary manual writes is outside this
user-invoked generative-AI change. Its existing fail-closed checks remain in place.
This receipt does not assert that providers never process content submitted by
minors, establish a parental-consent exception, or close the separate terms and
payload review for those automatic checks. No common account/workspace age gate
was changed to 18+.

## Verification

Focused permission/transport checks use a nonconnecting unit database sentinel
and fake transports. The actual media-worker fixture runs in a fresh child
process, mocks only unchanged lease/role storage seams, and verifies zero network
dispatch for teen/missing/changed accounts. It does not certify those mocked
authority checks or live provider behavior. Existing local-parser and General
attachment-only tests cover the preserved provider-free branches.

Canonical Storefront command/worker tests use the existing in-memory storage
port. They cover refusal before reservation, changed age after queueing, zero
provider calls/token settlement, retained read access and a manual draft save.
Adult success, unknown-outcome custody, cancellation and concurrency cases remain.

Two Studio preview tests in the full Storefront file fail on filtered catalog
totals/pin reads. Both were reproduced with the original HEAD test content and
unchanged preview implementation; their assertions were not weakened. The exact
age/content worker subset passes separately. The coordinator was informed; this
is not a claim that the full Storefront suite passes.

The existing local Marketing/API services passed readiness with the trusted
Portless CA. A safe GET compiled the public POST route and returned 405; its
generated server chunk contained the new provider-free response before UI sends.
Actual Chrome checks on `https://ewatrade.localhost/#assistant` verified feature
and exact NGN plan help, the 18+ notice and the existing registration view with
13–15/16–17/18+ choices. Only the view was checked; no registration was submitted.
Test messages were cleared and the panel closed afterwards.

Private UI receipts:

- `/private/tmp/ewatrade-adult-ai-public-help-2026-11-09.png`
- `/private/tmp/ewatrade-adult-ai-registration-preserved-2026-11-09.png`

Final checks:

- Nine-file permission/transport/media run: **57 pass, 1 real-provider test skipped,
  226 assertions**.
- Storefront age/content/worker subset: **11 pass, 84 assertions**, including late
  refusal preserving unknown-outcome custody. The two baseline failures above
  remain visible; this is narrower than the full file.
- Explicit 29-owned-path fast smoke: **284 pass, 1,813 assertions**, QA tooling
  types and changed-file Biome pass; no unsupported change mappings.
- Full API, jobs, AI and Marketing TypeScript checks pass.
- H01 regenerated with `APP_ENV=local`: byte-identical coverage snapshot.
- H02: one record covers capability/domain/API/client; no capability or procedure
  rows changed. Whitespace/diff review passes.

Private logs use `/private/tmp/ewatrade-adult-ai-` with suffixes
`final-focused-2026-11-09.log`, `storefront-focused-2026-11-09.log`,
`storefront-baseline-2026-11-09.log`, `quick-2026-11-09.log`,
`{api,jobs,ai,marketing}-types-2026-11-09.log` and `h02-2026-11-09.log`.
No actual model call, SQL fixture, migration, provider setting, deployment,
signed client or mobile-release acceptance follows.

## Acceptance boundary

This is a local source checkpoint. Existing Production b0 and signed Android36 /
iOS10 do not contain this change. Hosted and signed refusal/allowed-adult checks,
the automatic-safety terms/payload review, actual recipient/retention evidence,
end-user geography controls and the remaining store/privacy/legal acceptance
remain open. Android release milestones remain 1/8 and all 18 acceptance tickets
are retained. The shared legal draft still needs exact final-content approval.

## Independent review follow-up: Setup/Product HTTP refusal

The Apple/root coordinator's independent review found that the real Setup/Product
workflow let the model resolver's `TRPCError(FORBIDDEN)` escape to the global
500 handler. Dispatch was blocked, but the intended 403/adult guidance was lost.
The regression first reproduced **500 instead of 403** on the unmodified route.

`handleChat` now uses its existing `{code,error}`/`no-store` failure response for
TRPC client errors. It leaves server errors and unexpected exceptions to the
existing global public-error envelope; normal WorkflowTurnError handling and
rate-limit Retry-After remain. No global error handler, provider or age policy
changed.

The actual registered Hono POST regression uses the real workflow and default
model resolver with a narrow in-memory account-age reader/repository. Both
Setup and Product cover 13–15, 16–17, undeclared and missing accounts: 403 with
fixed adult guidance, zero configuration reads, zero runs/budget reservations/
draft writes, and released concurrency lease. Original role refusal, ordinary
turn, replay, rate/budget-limit and stream tests remain; unexpected and internal
TRPC failures retain the sanitized 500 envelope without the private message.

Focused route/resolver checks: **29 pass, 1 real-provider test skipped,
169 assertions**. Private red/green logs:
`/private/tmp/ewatrade-adult-ai-http-{red,green}-2026-11-09.log`. Explicit four-owned-path smoke passes **284 tests / 1,813 assertions**, plus
QA tooling types and Biome; plan has no unsupported mappings. Full API types
and H02 pass. H01 unchanged coverage evidence is reused because no procedure
or capability rows changed. Whitespace checks pass. Root owns separate
release-review evidence; this source correction is not deployment or acceptance.

### Follow-up review and bounded lease evidence

The independent Spec follow-up and coordinator readback accepted `218c92cca`'s
P2 correction. The original single `acquire().release()` assertion under the
default concurrency limit of two did not independently prove zero leaked slots;
one leaked slot could still admit another. The unchanged workflow `finally`
release supplied source evidence, not a stronger runtime assertion.

The existing eight-combination HTTP regression now explicitly configures
`concurrencyLimit: 1`. Its post-refusal acquisition fails if the workflow leaks
its only slot. The named regression passes **1 test / 64 assertions** across
the same eight combinations; Biome passes. Private log:
`/private/tmp/ewatrade-adult-ai-http-lease-2026-11-09.log`. Only test configuration
and this evidence changed; prior application types, source smoke and impact
checks remain applicable and were not repeated. No application policy or
release setting changed. The automatic-screening product decision is separately
pending with the owner; no option has been implemented.

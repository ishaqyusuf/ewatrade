# Direct signup, launch pricing and setup-video release preparation

Status: draft source candidate; marketing launch and final media acceptance pending.

The public acquisition path changes from early access and waitlist requests to
email-verified signup. Existing setup links remain valid. Account creation still
requires verified email ownership and the effective legal publication. Protected
Preview intake stays closed, with contact CTAs when signup is unavailable.

Free forever supports one owner, one Store within a Tenant, two non-archived Catalog
items (Products or Services, including Drafts), and thirty new Commercial Orders
per UTC month. Atomic checks serialize signup budgets and Free catalogue writes.
New businesses start on Starter during launch. Paid tiers remain free during launch;
product caps and report-history windows that are not enforced are not advertised.
Native source reconciliation is a separate handoff; this candidate has no native binary.

The homepage player supports Web/Mobile variants, business chapters, optional sound,
English captions and a transcript. It defers media until playback is permitted or
requested, respects reduced motion and Save-Data, pauses when hidden, and preserves
position and explicit playback choices between variants. HLS uses bounded buffers.
Production hides the section until both real sources are configured. Complete video
metadata also requires a poster and actual publication date.

Footage is a labelled fictional QA rehearsal of the enabled text-only assistant.
Marketing narration does not add spoken replies to the app. Voice, image, file and
automatic-variant claims are excluded. The first measured rehearsal took 69.3 seconds
after signup, so neither full signup timing nor a subminute setup claim is supported.
Final Web/Mobile captures, renders, hosting and delivered-asset acceptance are pending.

## Validation

The isolated candidate is based on assistant release 55915e79. Selected changes were
applied through three-way patches to preserve newer assistant code and exclude the
unrelated dirty shared checkout. Temporary local capture launcher changes were restored.

- Integrated signup/pricing/API/navigation/error checks: 54 tests, 262 assertions.
- Final pricing/player/legal-probe checks: 27 tests, 151 assertions.
- Stream review: 115 unique source tests, 484 assertions, plus one guarded Development
  concurrency test with eight assertions and exact fixture cleanup. Repeated runs
  above are integration evidence, not additional unique coverage.
- Player browser widths 320/390/768/1280/1440 and five playback scenarios pass with
  zero page errors. Scoped section/player and onboarding typing passes. Full Marketing
  and onboarding typechecks exhausted 8 GiB and 4 GiB respectively.

The pre-existing SSR legal probe correction strips React text-boundary comments
before comparing legal versions. Regression tests accept real SSR and reject versions
found only in comments. Actual account-deletion intake readiness remains separate.

## Release gates

The existing generated additive SIGNUP migration is applied in Development and absent
from Preview/Production. Roll out through the reviewed target workflow before direct
signup activation. No target schema rollout is claimed by this source packet.

The exact disposable Development signup browser submission awaits authorization after
automatic approval review rejected the consequential action. No owner Terms were
accepted. Protected Preview cannot establish ordinary Production intake acceptance.

Local enabled analytics produced no POST batch. SDK Strict Effects cleanup is a
hypothesis requiring production-build verification; delivered analytics remains open.
Final media size, constrained-network playback, physical iOS Safari, exact hosted
candidate and launch readback remain open. The assistant Production release is a
separate completed dependency, not evidence that this marketing candidate is live.

Private Brain documentation contains the canonical task ledger and evidence reports
and is intentionally excluded. A source-file manifest accompanies this candidate.

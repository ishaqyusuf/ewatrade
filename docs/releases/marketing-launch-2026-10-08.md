# Direct signup, launch pricing and setup-video release preparation

Status: reviewable source and real-media candidate; final hosted acceptance and Production authorization pending.

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
All ten Web/Mobile captures and twenty Catalog records pass actual readback. Final
corrected films, captions, posters and adaptive renditions are in the dated public
media package. Hosted playback acceptance follows this commit.

## Validation

The isolated candidate is based on assistant release 55915e79. Selected changes were
applied through three-way patches to preserve newer assistant code and exclude the
unrelated dirty shared checkout. Temporary local capture launcher changes were restored.

- Integrated signup/pricing/API/navigation/error checks: 54 tests, 262 assertions.
- Initial final pricing/player/legal-probe checks: 27 tests, 151 assertions.
- Latest profile-default/signup regressions: 8 tests, 41 assertions.
- Final 146-second player/complete transcript checks: 12 tests, 51 assertions.
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

The SIGNUP enum is present in Development and absent from Preview/Production. Fresh
read-only diffs from this isolated candidate show exactly one additive statement on
each target: ALTER TYPE LeadCaptureType ADD VALUE SIGNUP, with no other Prisma drift.
The existing generated migration stays in source. Existing Development migrate/push
commands passed. Chosen hosted targets require a reviewed, authorized root db:push
workflow; do not blindly replay a migration ledger that earlier schema pushes did
not certify. No target rollout is claimed.

The exact disposable Development signup browser submission awaits authorization after
automatic approval review rejected the consequential action. No owner Terms were
accepted. Protected Preview cannot establish ordinary Production intake acceptance.

Local development emitted no analytics POST batch. The production build passed all
five player scenarios with five actual delivered video events in each. This isolates
the failure to development lifecycle behavior; external collector acceptance stays open.
Initial final hosted160assets pass all hashes/MIME/cache andMP4Range206; five
responsive widths pass. Five actual playback scenarios pass, including400kbps/400ms
mobile. Native Chrome HLS backward seek failed outside its current buffer, while
Hls.js succeeds. The player now prefers supported Hls.js/MSE with native fallback;
this source fix has14tests/61assertions and awaits refreshed exact Preview acceptance.
A local production build with actual media emitsvideo_progress25 after40seconds
actualwatch. Preview503 is the existing proxy guard before analytics context/ingest,
so no hosted batch is expected and the guard is unchanged. Production collector and
launch readback remain open. Physical iOS Safari and collector persistence are not claimed. The assistant Production release is a
separate completed dependency, not evidence that this marketing candidate is live.

Private Brain documentation contains the canonical task ledger and evidence reports
and is intentionally excluded. A source-file manifest accompanies this candidate.

Draft review: https://github.com/ishaqyusuf/ewatrade/pull/58, initial source commit
c4b72daa. Final media assets and rollout evidence will be added before launch.

## Final media delivery

Both corrected films are 146.005 seconds at 24 fps, H.264/AAC. Web is 1920×1080
(5,377,987 bytes); Mobile web is 720×1280 (3,931,981 bytes). Chapter starts are
8/34/60/86/112 seconds. All signup scenes use the actual “Start your next chapter”
heading. Complete intro/chapter/outro narration has English captions and transcript.
Setup footage, clocks and exact twenty-record database proof are preserved.

The versioned `/media/setup-2026-10-08/` package includes adaptive HLS, review MP4s,
posters, captions, chapters, credits and an asset hash manifest. Web renditions are
854×480/1280×720; Mobile is 480×854/720×1280 for portrait readability. Four-second
segments cover 146 seconds. The entire explicit package is approximately 34.7 MB;
a viewer requests its selected adaptive rendition, not the whole package. Raw
footage, fixture identifiers, model caches and dependencies are excluded.

Six public media paths and optional client analytics emission are configured only
for this review branch. The existing Preview API guard refuses analytics context before ingest; no batch
is expected. Client transport and actual watch milestones must be distinguished
from Production collector acceptance. Production media settings and publication date remain unset.

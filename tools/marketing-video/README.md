# Real EwaTrade marketing video production

Independent package; run `bun install --env-file=/dev/null` here. Its lock does not
modify the shared app workspace. Remotion renders actual captured UI; no mocked
screens, client response interception or generated assistant lines.

1. Create data-only QA fixtures through the repository's verified local loader:
   `node scripts/with-workspace-env.mjs DEV_PROFILE=local APP_ENV=local bun --env-file=/dev/null tools/marketing-video/scripts/seed.ts`
   from the repository root. Script rejects missing Production identity, matching
   Production host, non-Neon host, wrong profile or unconfigured QA domain.
2. Use the current assistant source in a safe nonproduction runtime. Existing
   root source can be stale: do not record a different UI from the released one.
3. `VIDEO_DASHBOARD=https://capture-dashboard.localhost node scripts/capture.mjs web`
   and the same command with `mobile`. Use `--resume` to preserve successful takes.
   This isolated host serves the coordinator's merged assistant release55915e79.
   Do not restart it with candidate defaults or capture the older root runtime.
   Captures allow only explicit local hosts and match selected QA profile to
   exact new fixture Tenant. Signup only fills the real form; it never submits,
   verifies email, accepts Terms or creates a paid subscription.
4. `node scripts/narration.mjs` downloads Apache-licensed Kokoro q8 (~97MB) once
   and generates English narration with bundled `af_heart`. Entire inference is
   local. Model cache is isolated and ignored. No API credits or cloning.
5. `node scripts/prepare.mjs` trims raw capture at measured setup entry, adjusts
   playback only when needed and exports the actual multiplier, captions and
   shared146s chapter contract. Missing real capture refuses full rendering.
6. `node scripts/render.mjs web` then `node scripts/render.mjs mobile`; outputs
   are H264/AAC MP4, posters, VTT and JSON provenance under `output/`.
7. From the repository root run the read-only fixture check:
   `node scripts/with-workspace-env.mjs DEV_PROFILE=local APP_ENV=local bun --env-file=/dev/null tools/marketing-video/scripts/verify-records.ts`.
   It checks exactly two Catalog items per owned QA tenant, product/service kinds,
   NGN prices and opening stock.
8. `node scripts/verify.mjs` checks both streams, duration, five captures, profile
   keys, caption order/bounds and output hashes. Inspect rendered frames too.
9. `node scripts/export-hls.mjs` exports local Web480p/720p and Mobile480px/720px-wide VOD renditions with four
   second segments. Hosting and publication remain a coordinator release gate.

`--intro-only` renders an8s creative sample without claiming capture completion.
`prepare.mjs --captions-only` and `verify.mjs --captions-only` validate narration
and timing before product footage is ready. `capture.mjs --inspect --chapter=poultry`
reads actual UI/state without recording a product conversation.

All media/cache outputs are ignored locally. Copy approved outputs explicitly
into the coordinator's selected public hosting destination; never publish the
private upload store or credentials. Source packet is `tools/marketing-video/**`
excluding ignored files. License/voice provenance is in THIRD_PARTY_NOTICES.md.

The film visibly labels provider-free QA rehearsal, separates signup, measures
**setup time after signup**, and labels actual speed-ups. It does not prove
Production signup, live AI quality, native app parity or subminute onboarding.
No voice/photo/file input or in-app read-aloud is shown.

## Captured review packet · 8 October 2026

All ten actual typed QA flows passed explicit Add and Catalog name readback.
Independent read-only DB verification passed exactly two items per tenant, all
NGN prices, opening stock and Laundry Service kinds, with no duplicates. Setup
measured66.724–75.004s after signup; the form remains a separate unsubmitted scene.

Both films are146s/24fps: Web1920×1080, Mobile web720×1280. Chapters begin at
8/34/60/86/112s. The real Development UI indicator remains in review footage.
`output/media-contract.json` is the player timing/provenance contract;
`output/records-verification.json` is DB evidence, `output/verification.json`
is final encoded-file verification, and `output/source-manifest.json` lists
source-only owned paths and SHA256 hashes for the coordinator. Final posters use
actual Added stills and visibly label the still and full measured setup time.

`prepare.mjs --variant=web` or `--variant=mobile` prepares a completed variant
while preserving its sibling. `render.mjs <variant> --poster-only` refreshes only
the poster; film rendering always keeps actual video.

For portrait readability, Mobile HLS preserves480×854 and720×1280 resolutions.
Web HLS is854×480 and1280×720. `export-hls.mjs --variant=mobile` transcodes only
that variant; video targets remain450kbps/1.1Mbps, audio64kbps.

To refresh only signup stills after truthful UI copy changes, run
`VIDEO_DASHBOARD=https://capture-dashboard.localhost node scripts/capture.mjs web --signup-only`
and the Mobile equivalent. This mode waits for the actual corrected heading,
blocks every write request, never submits or logs in, records a separate
`capture-signup-<variant>.json`, and preserves setup video/capture manifests.
Rerender films and HLS before refreshing delivery hashes.

Final verification also requires all ten corrected signup capture records, zero
write requests, exact heading and refreshed PNG hashes; this prevents the old
unsupported headline being accepted again.

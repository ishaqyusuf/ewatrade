# Android candidate readiness refresh

10 November 2026. Offline source/native-configuration follow-through after root's
[mobile type repairs](2026-11-10-mobile-candidate-type-repairs.md), exact source
`39ada60cdcf39c20de579c13c157581c8a92a4de`. Android acceptance remains
**1/8 (12.5%)**. No immutable build candidate or shared capture hold was selected.

## Verified scope

- Offline doctor passes dependency/client presence and local profile isolation.
  Canonical `api:preview:preflight` also passes local Preview database/auth
  isolation and API project linkage without connecting to a database. Neither
  check establishes actual promoted-process flags or hosted database equality.
- Exact existing Play Preview, Android transport and variant suites pass
  **10 tests / 93 assertions** in the minimal quick-test environment. These cover
  actual app configuration/profile refusals, Sandbox configuration, signing-guard
  behavior, transport override refusal and variant-scheme filtering.
- Fresh credential-free, offline Expo `config --type introspect --json` passes.
  The generated configuration has Android package `com.ewatrade.app`, iOS
  identity `com.ewatrade.preview`, scheme `ewatrade-play-preview`, fingerprint
  runtime, OTA disabled and foreground updates disabled. Generated Android
  application attributes explicitly refuse cleartext and have no overriding
  network-security XML. Other EwaTrade app-variant schemes are absent.
- The newly implemented saved-record HTTPS intent is present for
  `preview-dashboard.ewatrade.com/open/catalog-item/`. Neither Production
  Dashboard host is present in the generated intent data. This is configuration
  evidence, not domain verification, installed-app navigation or SDK traffic.
- Actual `playPreviewSigningFailures` still returns no failures for the approved
  protected local credentials; the registered upload certificate matches. No
  password or key was printed, copied or changed.
- Root's full mobile TypeScript pass and 16-test/110-assertion source evidence
  are reused from39ada60cd. There are no later mobile/package source changes at
  this checkpoint. No duplicate full typecheck or whole-checkout smoke was run.
  Earlier foreign Catalog/Prisma type failures no longer block this source graph;
  that correction does not accept a signed artifact or unrelated new features.

## Candidate and runtime gates

The checkout initially had only the operational Agent Chat change. During this
bounded refresh, two peer API test files became modified:
`apps/api/src/utils/staff-procedure-policy.test.ts` and
`apps/api/src/utils/staff-request-access.test.ts`. The canonical read-only
`resolveApiSourceRevision` check then refused source preparation with
“Commit or remove changed API release inputs before source staging.” Preserve
those edits. No clean artifact preparation was attempted; do not treat the
initial clean snapshot, current HEAD or successful native introspection as an
acknowledged capture window or final release qualification.

The [shared runtime proposal](../plans/2026-11-09-native-preview-billing-configuration.md)
remains frozen under root's finalization. Its exact six-entry catalog replacement
is still a proposal; current sensitive hosted catalog equality/extras remain
unknown. This follow-through makes no hosted-value recovery attempt or provider
call. Reader settings, test identity/cohort, actual deployed configuration,
controlled plan activation and authenticated RTDN remain separate gates.

No source behavior, schema, provider setting, credential custody, legal snapshot,
runtime flag, cloud build, upload, install, OTA, purchase or deployment changed.
No guardian grant or schema work was performed. The historical SDK/disclosure,
privacy and final signed/lifecycle acceptance requirements remain open.

## Evidence and documentation verification

Private, credential-free introspection and sanitized evidence, both mode0600:

- `/private/tmp/ewatrade-play-config-refresh-2026-11-10.config.json`
- `/private/tmp/ewatrade-play-config-refresh-2026-11-10.evidence.json`

Generated configuration SHA256:
`11bd01e2084eed6c58169396ad07a88f553c252654f979584b8dc9fa506fa246`.
HEAD remained39ada60cd during introspection; current native/package working
inputs were unchanged. No generated native directory or compiled artifact exists
from this config-only command.

The two-owned-document quick plan has no unknown mappings. Core51tests/254
assertions and QA-tooling type evidence from the prior signer checkpoint are
reused after checking the relevant sources remain unchanged. Fresh tests and
actual config/signing/clean-source guard checks are recorded above; local links
and whitespace pass. Peer API tests are excluded from this documentation scope.
Brain impact: local `.brain/features/native-store-billing.md` and
`.brain/tasks/in-progress.md`.

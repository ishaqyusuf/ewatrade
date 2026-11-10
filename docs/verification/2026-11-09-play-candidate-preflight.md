# Android candidate preflight checkpoint

**10 November source refresh:** current Play Preview introspection and actual
local upload-signing checks pass at native source39ada60cd. Root's full mobile
typecheck is reused; earlier foreign Catalog/Prisma type failures are historical.
No immutable candidate is pinned. New peer API test changes are refused by the
canonical clean-source staging guard. See the
[current bounded receipt](2026-11-10-android-candidate-readiness-refresh.md).

**Later checkpoint:** Vercel CLI login is restored and the approved existing
upload signer passes the actual local certificate check. The normal protected
Preview environment pull still redacts the hosted product catalog, so current
hosted equality remains unproven. New peer changes include `app.config.ts` and
API release inputs; the earlier unchanged-native-source observation below is
historical and cannot certify that newer candidate. See the
[execution receipt](2026-11-09-play-signer-and-publisher-readiness.md).

9November2026. Continues after approved secret/RTDN provisioning in31e073775.
No active runtime profile, hosted product mapping, signing credential or build was
changed by this offline preparation.

- Canonical `api:preview:preflight` passes local environment/database isolation and
  exact API project-link checks without connecting to the database.
- Existing validated native introspection remains applicable: app config,
  Play Preview profile and native plugin sources are unchanged since1e66ebc04.
- Root supplied the accepted three-entry Apple catalog from
  `docs/billing/apple-subscription-products.json`, raw SHA256
  `bfa41065a4984dd6be54ef0a3d9e0bce77d6d6d4ef071e05a763bb8fe2b58531`.
  Its7November installation receipt is dated evidence, not a fresh hosted read.
- A proposed union with canonical `play-subscription-products.json` has six entries
  (three Apple, three Play). The existing strict schema accepts it; duplicate
  store/product identities and plan conflicts were checked. The pure Play Preview
  validator returns no failures using the proposed values and existing valid local
  Publisher key. This does not install or accept those settings.
- Root `.env.preview` has zero Apple products, while the browser shows a hosted
  Preview Apple mapping row. Do not derive a replacement catalog from the empty
  local baseline. Current hosted value equality and any additional existing
  entries remain unverified; preserve the hosted value pending a protected read.
- The actual local Android signing check fails: the current ignored credentials
  file has no Android entry. A metadata-only EAS lookup confirms one default JKS
  whose public certificate matches registered AAB36. No private signer fields
  were requested, exported or displayed. See the
  [specific custody review](../plans/2026-11-09-play-upload-key-custody.md).
- Standard Vercel CLI session restoration was attempted after its existing token
  became invalid. The browser shows the correct current Mac/account request, but
  Allow Access is disabled after a normal refresh; no browser console error was
  observed. No disabled control was forced or project access expanded. The normal
  login remains pending at this checkpoint; root confirmed no shared-auth hold.
- Root's independent Preview audit96a972d98 also records jobs Preview billing off
  and the selected existing QA Owner outside the owner-billing cohort. These are
  additional runtime/test-case gates; no new owner eligibility, readiness or
  purchase authority follows from the proposed catalog or signer metadata.

The private proposal is wrapped `BLOCKED_REVIEW_ONLY`, with explicit hosted-map
comparison and local-signing blockers. It is not a dotenv profile or execution
instruction. Evidence:
`/private/tmp/ewatrade-proposed-play-preview-preflight-2026-11-09.evidence.json`
and `/private/tmp/ewatrade-eas-public-android-signer-2026-11-09.evidence.json`.

No app code changed. Reuse unchanged51tests/254assertions and QA-tooling evidence
from31e073775 for documentation mapping; fresh source/hash, strict catalog,
local-signing refusal, metadata identity, link and whitespace checks remain
bounded preparation. No signed, hosted, privacy, purchase or lifecycle acceptance
is implied. Android stays1/8 and the full18-ticket scope remains open.

# Android release transport and Play Preview prebuild

9 November 2026. Source/native-configuration checkpoint for Android tickets 03
and 08; not a signed artifact, network capture, Data safety declaration or rollout.

## Changes and reproduced failure

The supported Android minimum is API24. The existing build36 manifest did not
explicitly refuse cleartext. The new local Expo AndroidManifest plugin writes
`android:usesCleartextTraffic=false` for Production, Preview and Play Preview.
Development explicitly permits local Metro/API HTTP, including after an
incremental release-to-development prebuild. Release prebuild fails if an existing
`networkSecurityConfig` could override the attribute; it does not delete or
silently replace that configuration. No dependency or iOS mod was added.

Actual Play Preview configuration also exposed a pre-existing blocker:
`app.config.ts` selected `ewatrade-play-preview`, while the variant-scheme plugin
rejected it with “Configure one EwaTrade variant scheme before prebuild.” The
scheme is now part of the known app-scheme set. Incremental prebuild removes the
other three app schemes while retaining Google/Expo and HTTPS links. Existing
Production, Preview and Development scheme behavior is retained.

## Verified native configuration

Fresh credential-free Expo `config --type introspect --json` results:

| Profile | Package | Cleartext | Other observed controls |
| --- | --- | --- | --- |
| Production | `com.ewatrade.app` | `false` | Production variant |
| Development | `com.ewatrade.dev` | `true` | Local development compatibility |
| Play Preview | `com.ewatrade.app` | `false` | `ewatrade-play-preview`; no other app variant scheme; OTA disabled |

No native directories, generated app or provider setting were changed by
introspection. Private JSON/log outputs are
`/private/tmp/ewatrade-transport-{production,development,play-preview}-introspection-2026-11-09.*`.
The Play Preview output supersedes its initial failed introspection; a direct
configuration/plugin call independently reproduced the original rejection.

Focused regression checks pass **5 tests / 25 assertions**: incremental transport
switching, conflicting XML refusal, missing application refusal and variant
selection/filtering across all four app schemes. Explicit eight-owned-path quick
smoke passes **285 tests / 1,818 assertions**, QA tooling types and changed-file
checks, with no unsupported mappings. The bounded H02 record evaluates without
errors (these native/config/test/doc paths add no gated feature area or procedure).
H01 rows are unchanged for this scope; no global gate pass is claimed.

Full mobile TypeScript was attempted once and is **blocked by five errors** in
the concurrent `platform-business-catalog.ts` and `public-storefront.ts` database
queries: their ungenerated Prisma fields/relations include `publicCatalogListedAt`
and `platformListed`. No owned-file type error was reported. Those unrelated
schema/query changes were preserved, and no generate/migrate/push was run to
hide the dependency. Private log:
`/private/tmp/ewatrade-native-prebuild-mobile-types-2026-11-09.log`.

## Disclosure and release limits

[Android's application documentation](https://developer.android.com/guide/topics/manifest/application-element#usesCleartextTraffic)
describes best-effort enforcement, including raw-socket limitations, and the
network-security XML override on API24+. The attribute is being deprecated for
target API38+; this candidate still targets36. Reassess the policy when raising
that target. This platform policy is not proof that every SDK request or redirect
is encrypted. Google sign-in collection, effective analytics/diagnostics settings,
recipient roles, storage and the final-candidate traffic delta still require the
[existing SDK/transport review](2026-11-08-android-sdk-transport.md).

The change needs a new signed Android artifact; it is absent from uploaded36 and
installed33. The isolated Play Preview profile is still unbuilt/undistributed.
No credentials, purchase, plan activation, app installation or deployment occurred.
Android remains1/8. H01 procedure coverage is unchanged; global concurrent
Finance/Catalog checks are not accepted by this bounded checkpoint.

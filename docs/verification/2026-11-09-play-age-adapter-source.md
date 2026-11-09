# Play Age Signals offline adapter preparation

9 November2026. Reversible source preparation under the ongoing Android goal and
coordinator seam review. **Not enabled, product-integrated, signed or deployed.**
No real SDK call, sharing prompt, age/Terms/account mutation, Console action,
additional Integrity SDK, APK/cloud build, signing, upload or publication occurred.

## Delivered source boundary

A separate Android-only local Expo module pins Google's `age-signals:0.0.4`.
Its two exported methods are blocked by native `RELEASE_ENABLED = false` before
SDK/context access; there is no JS/environment/OTA activation path. A future
reviewed native source change and signed build are required after terms/access
approval. The module is not added to iOS, the updater, or a product startup hook.

The actual TS caller requests access first and queries data only after shared
access. Native code also requires a one-use shared-access decision before a read.
The normalized contract distinguishes disabled, unsupported, unknown, not-shared,
verification-required, unavailable and shared observations. It validates nullable
inclusive bounds and retains source-tier/significant-change distinctions. Null
bounds do not establish adulthood; a valid adult lower bound may have no upper.
Identifiers, raw SDK objects, dates, DOB and arbitrary extra fields are not exported
or stored. Source tier self-declaration is never called verified identity.

A reader deduplicates in-flight calls, discards invalidated/context-switched results
and refuses the data query if context changes after the sharing prompt. Completed
observations are not cached or persisted. The eventual caller must supply a
monotonic context revision and invalidate on session/install/foreground changes;
that product lifecycle wiring is not delivered by this checkpoint. Results are
explicitly `unattested-client`, with a local observation time, not server proof.

Local hints can flag known under13/minor restrictions, mandatory Play resolution
or approval review; they never grant adulthood or override account/server policy.
Optional sharing refusal and unavailable/unknown cases do not become a new global
block on existing eligible13+ structured access. No header, RPC, database field,
canonical declaration, web/iOS policy or assistant capability changed.

## Verification performed

- Focused exact-file tests: **9 tests / 75 assertions pass**. These exercise real
  TS access→query orchestration, all status distinctions, malformed/custom/null/
  adult ranges, source tiers, stripped identifiers, restrictive hints, stale
  access/result handling, concurrency, errors and the actual optional-module
  adapter with isolated Expo/React Native mocks. They are not real SDK consent.
- Full Mobile TypeScript passes with incremental state disabled/16GB heap cap.
- Existing Expo autolinking resolver discovers
  `expo.modules.playagesignals.PlayAgeSignalsModule` on Android and omits it from
  Apple. This is discovery, not an application/native linking build.
- The official Google Maven0.0.4 AAR was downloaded as public metadata. SHA-256:
  `0f47c1dcef35feb637d879cd7fffff555a19398b850b2cc9814f61f54876e989`.
  `javap` confirms actual two-method manager/access builder/result getters and
  model constants used by the adapter. Its manifest minSDK23 and non-exported
  consent Activity were inspected; the app's existing minSDK24 is separate.
- **Compile-only Kotlin check passes** against the actual0.0.4 classes, Android36
  framework, existing compiled Expo API, ReactAndroid0.81.5/GMS tasks and cached
  Kotlin2.1.20 compiler. Outputs stay under `/private/tmp/`; no native class was
  executed and no Gradle application build, signing or packaging occurred. This
  proves source/interface compilation, not merged/signed runtime compatibility.
- Final explicit eleven-owned-path plan has zero unknowns; smoke passes
  **284 tests / 1,813 assertions** plus QA-tooling types/Biome. H02 passes one
  reviewed client personal-identity exclusion record with zero capability or
  procedure changes. Unchanged H01 route snapshot evidence is reused from the
  preceding undeclared-account repair. Receipt links/diff review pass.

Private tests/type/autolinking logs:
`/private/tmp/ewatrade-play-age-*-2026-11-09.*`.
Compile-only recipe/arguments/result:
`/private/tmp/ewatrade-play-age-native-typecheck-2026-11-09.py` and matching directory.
No credential, raw age response or customer record is included.

## Open before product use or country/safety acceptance

1. Exact Google Age Signals terms/access approval before a real invocation.
   Publisher API consent is separate. Do not change custom age minima as a coding
   shortcut or request another minimum-age decision: existing policy remains13+.
2. Reviewed product lifecycle/UX mapping for mandatory resolution, optional refusal,
   known-minor conflict and unsupported/error states, preserving support/privacy
   recovery. Source hints are not implemented enforcement or regional compliance.
3. A reviewed provenance/integrity/replay/session/install/freshness decision before
   any server use. Arbitrary client JSON cannot mint server-trusted age. No
   additional attestation SDK/access is introduced by this preparation.
4. Applicable significant-change and revoked-approval lifecycle, including any
   necessary install-ID binding/retention and authenticated handling. Status hints
   alone do not implement parental revocation; do not discard required lifecycle
   behavior just to claim no retention.
5. Exact native dependency/fingerprint/merged manifest/R8/signed Play-delivered
   physical-device checks and real sharing/required/unavailable behavior under
   approved test scope. Do not use a real minor as a test fixture.
6. The single shared legal/Data safety inventory must reflect actual enabled use
   and retention before exact legal approval and submission. Current Android36
   and iOS10 artifacts and their previous evidence remain unchanged.

Primary contracts checked9November2026:
[SDK integration](https://developer.android.com/google/play/age-signals/use-age-signals-api),
[request flow](https://developer.android.com/google/play/age-signals/request-age-signals),
[response meanings](https://developer.android.com/google/play/age-signals/understand-age-signals-responses)
and [permitted use/terms](https://developer.android.com/google/play/age-signals/overview).
This receipt does not certify legal compliance.

[Existing audience/country review](2026-11-09-play-audience-country-review.md) ·
[Independent undeclared-account repair](2026-11-09-mobile-age-declaration-repair.md)

Brain: `.brain/features/play-age-signals.md` and `.brain/tasks/in-progress.md`
updated locally; assistant access is excluded for this personal identity data.

# Existing iOS signing restoration — 8 November 2026

Status: existing same-key local signing restored and verified at 14:46:40 WAT.
No build, upload, submission, certificate/profile/key creation or rotation occurred.
The Apple coordinator retains candidate selection and release-gate ownership.

## Authority and exact identity

The owner resumed Apple launch work with “proceed”. The established 10 October
and 19 October approvals already covered protected retrieval/repackaging/reuse
of the existing EwaTrade signing material. The coordinator requested this same-key
restoration, retaining remote credentials and holding build execution until the
appropriate candidate and test boundary are pinned.

A metadata-only Expo read first confirmed project
`532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b`, registered bundle `com.ewatrade.app`,
APP_STORE certificate/profile and existing upload key `C8P5X2ZD7M`. Certificate
team metadata remains null in Expo, as historically documented; the actual
certificate and embedded profile prove the team. The existing certificate/profile
payload was then retrieved through authenticated read-only queries into a private
directory. No upload key payload was requested.

- Exact historical certificate SHA-1:
  `232A54B6244A2BDAA910844B709D1EE5B9BA4399`.
- Serial: `31012C8EAA984901B96B29FED0C7A99B`.
- Certificate team: `ZXC78SPCV4`; expires 27 September 2027, 13:29:07 UTC.
- Profile: EwaTrade App Store, UUID `e32ce490-198e-42da-86a4-6ad7aa1eb128`.
- Profile app: `ZXC78SPCV4.com.ewatrade.app`; same team and expiry.
- Profile contains the exact certificate; private-key public DER matches it.
- `get-task-allow=false`, `beta-reports-active=true`, Apple Sign In `Default`,
  associated domains `*`, no provisioned-device list or all-devices distribution.
- Profile CMS content/signature verification passes with chain trust explicitly
  disabled; this is not a fresh Apple revocation or CA-trust assertion.

The Mac's other installed distribution identity was not substituted. Repackaging
retained the exact certificate/private key with the previously verified 3DES/SHA-1
PKCS#12 compatibility settings. Disposable macOS keychain import and exact identity
lookup passed. The temporary keychain was deleted, and the original keychain search
list/default were verified unchanged. The filesystem sandbox initially refused
keychain creation; the already-authorized verification passed with escalation.
No automatic approval review rejection occurred.

## Local custody and archive boundary

`apps/mobile/credentials.json` is mode 0600 and references only the restored
private profile and encrypted P12. Their directory is mode 0700; files are 0600.
Original downloaded P12/password, repack password file and temporary plaintext
working PEM were removed after verification. The retained config contains the
package password and must stay private. No credential content is logged here.

The config was already excluded from EAS source archives, but a Git-ignore rule
was missing. This change adds only `credentials.json` to the mobile Git ignore.
`git check-ignore` passes; the existing ignore matcher confirms EAS and Vercel
exclusions for the config, P12 and mobileprovision paths. The entire mobile tree
is excluded from Vercel. Private signing material lives outside the repository.

Safe local proof: `/private/tmp/ewatrade-ios-signing-restoration-verified.json`.
The protected file locations are recorded there for the sole release coordinator.
Remote credential records remain unchanged. Local signing material is retained
only for the pending authorized build; secure cleanup remains part of that handoff.

## Acceptance limits

This closes local signing restoration, not signed-client, purchase, reviewer,
TestFlight delivery or public release acceptance. The existing Preview TestFlight
route uses Preview data and has purchasing disabled. It cannot establish the
Production reviewer's paid journey. The Apple coordinator is separately resolving
the exact Production-backed private test candidate and Sandbox verification scope;
ordinary Production release gates remain required. No build was started here.

Validation: exact certificate/key/profile checks, disposable macOS import,
permissions, cleanup and Git/EAS/Vercel exclusions all pass; documentation
whitespace/scope review passes. No product behavior changed, so no UI or source
suite was repeated for the one-line ignore addition and receipt.

Brain impact: `.brain/launch/ios-signing-owner-approval-packet.md` records this
restoration and the remaining candidate/build boundary. Local Brain remains ignored.

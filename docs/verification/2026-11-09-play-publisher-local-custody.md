# Google Play Publisher identity and local custody

Later same-day owner approval also permitted the
[Preview secret upload and inactive transport setup](2026-11-09-play-preview-notification-provisioning.md).
Earlier local-only custody and unapproved/unconfigured statements below describe
this receipt's original checkpoint. No runtime deployment or Play delivery followed.

9 November 2026. The owner explicitly approved the reviewed service account,
EwaTrade-only app permissions and one protected local JSON key. This completes
that setup checkpoint, not Android paid-runtime or purchase acceptance.

## Observed account changes

- Project: EwaTrade Mobile Retail Ops (`ewatrade-mobile-retail-ops`).
- Created **EwaTrade Play Preview Publisher**,
  `ewa-play-preview-publisher@ewatrade-mobile-retail-ops.iam.gserviceaccount.com`.
  The creation flow assigned no GCP project roles or additional principals.
- Submitted the reviewed invitation for **EwaTrade / `com.ewatrade.app` only**.
  Google Play now shows this identity **Active / Never expires**.
- Four app permissions: View app information (read-only), its implied View app
  quality information (read-only), View financial data, and Manage orders and
  subscriptions. Account-permission selection was empty before submission.
  No app admin, release, track, store-presence or policy-edit permission was added.
- Created exactly one JSON key; the refreshed Google key inventory shows one
  active generated key. The download-event wait timed out after creation, so no
  second Create was attempted. The actual success dialog named the downloaded
  file; that exact file was recovered and moved to approved custody.

The owner review explicitly acknowledged that the order permission includes
refund/cancel authority for this app. “Preview” in the name and local custody do
not restrict Google's app authority to Sandbox orders. Existing environment and
financial-action controls remain separate.

## Custody validation without network use

The one file is at the approved Git-ignored path
`.scratch/android-paid-launch-release/private/preview/publisher-service-account.json`.
Directory mode0700 and file mode0600 were verified. The exact temporary Downloads
copy no longer exists after the move. This is ordinary local file cleanup, not
a claim of forensic erasure or absence from operating-system backups.

The canonical `parsePlayPublisherServiceAccount` accepted the actual key, including
its RSA minimum-size validation. Project, service-account email and UI key identity
matched locally. No private key, token or credential JSON was printed, included
in Git, attached to a message or uploaded to a runtime. No OAuth exchange,
Publisher lookup, customer record, refund, cancellation or purchase was invoked.
Parser/custody success does not establish Google's API authorization or receipt
verification.

Private evidence:

- `/private/tmp/ewatrade-publisher-service-account-created-2026-11-09.png`
- `/private/tmp/ewatrade-publisher-play-access-active-2026-11-09.png`
- `/private/tmp/ewatrade-publisher-key-created-2026-11-09.png`
- `/private/tmp/ewatrade-publisher-local-custody-2026-11-09.evidence.json`

## Remaining acceptance

The [license/API checkpoint](2026-11-09-play-licensing-publisher-enabled.md) and
[native prebuild fix](2026-11-09-android-native-prebuild-hardening.md) retain their
original scope. Runtime secret destination/upload, exact controlled Preview
configuration/deployment, RTDN identities/topic/subscriptions/grants and the
registered app's notification settings remain separately unconfigured and
unapproved. No plan activation, signed build/distribution or rollout follows
from this setup. Keep Production's Google Sandbox refusal.

Android remains1/8; the original18-ticket acceptance scope is unchanged. Guardian
integration, final privacy/legal content, signed lifecycle, retained-record
downgrade and public-release requirements remain open. Existing source evidence
is reused; this receipt requires bounded custody/permission observation, owned
documentation checks, links and whitespace, not repeated app/provider tests.

Validation: explicit two-owned-document quick smoke passes **51 tests / 254
assertions** plus QA tooling types and changed-file checks; no unknown mappings.
Relative links and whitespace pass. Private check log:
`/private/tmp/ewatrade-publisher-custody-doc-quick-2026-11-09.log`.

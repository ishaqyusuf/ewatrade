# Preview Publisher secret and notification provisioning

9 November 2026. Owner approved both scopes in the
[committed setup plan](../plans/2026-11-09-play-preview-notification-setup.md).
The Apple coordinator's independent document review found no concrete Apple
configuration conflict; that review did not itself authorize provisioning.

## Saved API secret

Vercel `ishaqyusufs-projects / ewatrade-api`, project
`prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh`, now contains project variable
`PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON`, type **Secret**, environment **Preview**
(project-wide Preview, not a single branch). The existing approved local JSON
was transmitted directly into the secret input without displaying its contents.
Vercel confirmed “Added Environment Variable successfully” and that a new
deployment is required. **Redeploy was not clicked.** The protected local copy
remains. No billing flag, Apple setting or product mapping was edited.

The current CLI token was invalid during a read-only inventory attempt; the
existing browser session completed the authorized save. No CLI login or token
rotation was performed. Runtime use and Google API authorization remain untested.

## Created transport and exact saved settings

Google project `ewatrade-mobile-retail-ops`, number211207022957:

| Resource | Observed result |
| --- | --- |
| Keyless identity | `ewatrade-play-preview-rtdn@ewatrade-mobile-retail-ops.iam.gserviceaccount.com`; Enabled; no keys or Play/project roles assigned by this work |
| Source topic | `ewatrade-play-preview-rtdn`; no default subscription, topic retention, export, ingestion or transform selected; Google-managed encryption |
| Recovery topic | `ewatrade-play-preview-rtdn-deadletter`; same topic options |
| Recovery pull | `ewatrade-play-preview-recovery`; Active; attached to recovery topic; seven-day unacknowledged retention; acknowledged retention off; never expires; default10-second ack/retry-immediately; no ordering/exactly-once/dead-letter loop |
| Source push | `ewatrade-play-preview-api`; Active; attached to source topic; authenticated push using the keyless identity |
| Push endpoint and audience | Both exactly `https://preview-api.ewatrade.com/webhooks/store/google` |
| Push recovery | Ack60seconds; exponential10–600seconds; recovery topic above; maximum attempts10 (provider threshold is approximate) |
| Push lifetime/payload | Seven-day unacknowledged retention; acknowledged retention off; never expires; wrapped payload; no filter, ordering or exactly-once claim |

The recovery subscription was created before enabling the push subscription's
dead-letter configuration. The new service account initially did not appear in
the push form's cached selector. One full draft refresh retrieved it; the correct
keyless identity was then selected. The Publisher identity was never substituted.

## Resource-scoped access readback

Three new bindings were saved through forms that named the individual resource;
Google returned “Policy updated,” with its propagation caveat. Expanded resource
permission rows showed the exact principal under the selected role:

- Source topic: `google-play-developer-notifications@system.gserviceaccount.com`
  → `roles/pubsub.publisher`.
- Source push subscription:
  `service-211207022957@gcp-sa-pubsub.iam.gserviceaccount.com`
  → `roles/pubsub.subscriber`.
- Recovery topic: that same Google Pub/Sub service agent
  → `roles/pubsub.publisher`.

The keyless account's “Principals with access” view, with Google-provided grants
included, already showed that service agent inheriting **Cloud Pub/Sub Service
Agent** from the project. Google's
[current role reference](https://docs.cloud.google.com/iam/docs/roles-permissions/pubsub#pubsub.serviceAgent)
includes `iam.serviceAccounts.getOpenIdToken` and related signing permissions in
that role. Its existing authority was reused as the approved plan permits; no
redundant Token Creator or new project-wide grant was added. This is an IAM
configuration observation, not proof of a delivered or accepted OIDC request.

## Privacy and activation boundary

Both actual topic Storage policy panels show **Allow in any region** checked,
matching the project's unrestricted policy. No storage-policy update was made.
This is an allowed-location policy, not evidence of where any specific message
is stored. Record this in the shared privacy inventory before activating real
billing traffic. Each subscription has its own seven-day retention window;
forwarding may create a recovery copy with another window. No global seven-day
erasure or provider/log/backup deletion guarantee follows.

Fresh EwaTrade Monetization setup readback shows **Enable real-time notifications
unchecked**, **Send test notification disabled**, and **Save changes disabled**.
No Play notification setting was edited. The Pub/Sub resources are Active, while
Play delivery remains off. No publish, pull, acknowledge, replay, test notification,
purchase, refund/cancel, deployment, build, installation or rollout occurred.

The API Preview secret requires a later deployment; receipt handling, real
signature/audience/identity refusal, durable reconciliation, recovery operation
and paid lifecycle remain unaccepted. Preserve Production's Google Sandbox
refusal and require explicit Production cutover before real paid orders. Android
stays1/8; this does not complete ticket07 or any signed/public acceptance gate.

## Private proof and verification

Private screenshot prefix `/private/tmp/ewatrade-`:
`preview-publisher-secret-saved-2026-11-09.png`,
`rtdn-recovery-subscription-created-2026-11-09.png`,
`rtdn-push-subscription-created-2026-11-09.png`,
`rtdn-source-publisher-grant-saved-2026-11-09.png`,
`rtdn-source-subscriber-grant-saved-2026-11-09.png`,
`rtdn-deadletter-publisher-grant-saved-2026-11-09.png`,
`rtdn-existing-service-agent-access-2026-11-09.png`,
`rtdn-source-storage-policy-2026-11-09.png`,
`rtdn-recovery-storage-policy-2026-11-09.png`,
`play-rtdn-still-disabled-2026-11-09.png`.

No app code changed. Existing unchanged source/unit/native evidence is reused;
focused verification is actual configuration/grant readback, protected custody,
documentation mappings/links and whitespace. No provider or customer message was
sent to manufacture a transport pass.

Final bounded checks: explicit four-owned-document quick smoke passes51tests/
254assertions plus QA-tooling types and changed-file checks; no unknown mappings.
Thirteen local relative links, ten private screenshot images and whitespace pass.
The screenshot API returned JPEG data, verified by file-format metadata; original
`.png` filenames are retained to preserve existing evidence links. Private log:
`/private/tmp/ewatrade-preview-provisioning-doc-quick-2026-11-09.log`.

Next offline preflight: canonical API Preview local isolation/project-link check
passes. A **proposed** Play-only object passes the pure profile validator, but
is not an accepted runtime configuration: root `.env.preview` has zero Apple
product mappings while the hosted Preview has an existing Apple mapping row.
Do not overwrite it with an unreconciled local-derived catalog. The local Android
credentials file has no Android keystore entry, so the upload-certificate check
fails. No signer was exported, no profile/flag was changed, and no build started.
The private proposal is wrapped `BLOCKED_REVIEW_ONLY`. The Apple coordinator
provided the accepted three-entry `docs/billing/apple-subscription-products.json`
and its7November installation receipt. Its raw SHA256 matches
`bfa41065a4984dd6be54ef0a3d9e0bce77d6d6d4ef071e05a763bb8fe2b58531`.
The proposed union with canonical `play-subscription-products.json` passes the
existing schema with six entries, no duplicate store/product identity and no
plan conflict. This preserves the accepted source baseline, but is not a fresh
comparison with the current hosted value. No catalog write is authorized or made.

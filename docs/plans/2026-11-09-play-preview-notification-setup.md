# Preview Publisher secret and notification setup review

Later same-day status: the owner approved both scopes and they were
[executed with readback](../verification/2026-11-09-play-preview-notification-provisioning.md).
The original prepared scope below is retained. Play delivery remains off; no
deployment or test message is included in that approval or execution.

9 November 2026. **Prepared, not approved or applied.** The completed local
Publisher setup is [64fcf66bb's receipt](../verification/2026-11-09-play-publisher-local-custody.md).
Its approval restricted the key to local custody. The following two new actions
need explicit approval for credential transmission and security-sensitive grants.

## 1. One API Preview secret

Upload that existing JSON key to Vercel, team `ishaqyusufs-projects`, project
`ewatrade-api` (`prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh`), as the **Secret** project
variable `PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON`, **Preview environment only**.
This is the project-wide Preview environment, not a single branch. The value
is transmitted to Vercel for server-side Google purchase verification. Retain the
protected ignored local copy as approved custody. Do not copy it to clients,
jobs, shared team variables, Production, Git, screenshots or review notes.

Actual browser search found no existing variable with that exact name. The
unsaved form selects Secret and Preview; its value is still empty. The project
link agrees with the canonical Preview deployment/readiness scripts. The CLI's
read-only metadata attempt reports an invalid current token; the existing browser
session works. No CLI login or credential change was attempted.

This approval would install only this secret. Existing billing flags, Apple
settings and product mappings remain untouched. Applying an environment variable
to a new runtime requires the later exact-candidate release procedure.

## 2. Inactive Google notification transport

Use existing project `ewatrade-mobile-retail-ops` (number211207022957):

| Resource | Exact proposed identity/configuration |
| --- | --- |
| Keyless delivery service account | `ewatrade-play-preview-rtdn@ewatrade-mobile-retail-ops.iam.gserviceaccount.com`; display name EwaTrade Play Preview RTDN; no downloaded key, Play access or project role |
| Source topic | `ewatrade-play-preview-rtdn` |
| Recovery topic | `ewatrade-play-preview-rtdn-deadletter` |
| Push subscription | `ewatrade-play-preview-api`, attached to source topic |
| Recovery pull subscription | `ewatrade-play-preview-recovery`, attached to recovery topic; attach before enabling dead-letter forwarding |
| Push URL AND OIDC audience | `https://preview-api.ewatrade.com/webhooks/store/google` |
| Push/recovery retention | Seven-day unacknowledged retention each; acknowledged-message retention off; no subscription expiry during acceptance |
| Push retries | Ack deadline60seconds; exponential backoff10–600seconds; recovery forwarding after approximately10attempts |
| Topic options | Google-managed encryption; no default subscriptions, topic message retention, ingestion, transforms, BigQuery export or Cloud Storage backup |

Seven days is a **per-subscription** window: forwarding creates a recovery copy
with its own retention window, not a global seven-day deletion guarantee. Topic
storage-region policy and provider/log retention must be captured from actual
resources for the privacy inventory before any real billing-data activation.

Only the following additional bindings are proposed; reuse an already sufficient
binding rather than adding duplicates:

- `google-play-developer-notifications@system.gserviceaccount.com` gets
  `roles/pubsub.publisher` on the **source topic only**.
- Google's Pub/Sub service agent,
  `service-211207022957@gcp-sa-pubsub.iam.gserviceaccount.com`, gets
  `roles/iam.serviceAccountTokenCreator` on the **keyless delivery account only**.
- That same service agent gets `roles/pubsub.publisher` on the **recovery topic**
  and `roles/pubsub.subscriber` on the **source subscription** for forwarding.

Use the owner's existing authority to create resources; no new owner/admin/
project-wide role or paid-plan upgrade is proposed. Stop for review if actual
permissions or terms require broader changes. Google's normal Pub/Sub usage
pricing applies when traffic/storage is later enabled; this step sends no test
or customer messages.

The topic list currently has no topics. Source-topic and keyless-account forms
are populated but **Create has not been clicked**. Subscription/IAM forms depend
on those resources and will be checked against this exact scope before saving.
The proposal leaves Play's app RTDN switch/topic unchanged, so it does not start
Google Play notification delivery. It authorizes no publish/pull/acknowledgement,
refund/cancel, plan activation, purchase, deployment, build or distribution.

## Later acceptance and cutover

An unauthenticated, redirect-free GET of the canonical Preview `/live` returned
200 through Cloudflare. This establishes liveness only, not a deployed receipt
handler, OIDC acceptance, secret configuration, database or billing readiness.
The source route verifies Google signature/audience, verified email, exact service
identity and package, and reconciles ordinary purchase notifications before2xx.
Every claim needs final-candidate evidence; a TEST2xx is not lifecycle acceptance.

Before app RTDN enablement or a test send: accept exact isolated Sandbox API/
Dashboard/jobs configuration, privacy/retention/operator duties, current signed
candidate and the normal release gates. The app has one RTDN topic; Preview
naming is not a Sandbox-only provider boundary. Accept deliberate Production
cutover before real paid orders; retain Production's Google Sandbox refusal.

Primary references checked9November:
[authenticated push](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions),
[dead-letter forwarding](https://docs.cloud.google.com/pubsub/docs/dead-letter-topics).
Google documents an approximate forwarding threshold and required publisher/
subscriber permissions; never turn an uncertain result into an acknowledgement.

Preparation validation: the owned documentation mapping has no unknown paths;
reuse the just-passed51tests/254assertions and QA-tooling types from64fcf66bb after
verifying those tooling/test sources are unchanged. Local links, source endpoint/
project identity, empty-value/Preview-only UI drafts and whitespace were checked.
This is a scope review, not successful provisioning or transport acceptance.

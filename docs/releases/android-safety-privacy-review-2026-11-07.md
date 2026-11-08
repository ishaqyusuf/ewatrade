# Android safety and privacy review — 7 November 2026

8 November continuation: paid-owner retention policy/source is now approved and
implemented in `49df03a06`; hosted fulfillment remains open. Current API/Trigger
configuration and exact-key DB observations are recorded in the
[latest reconciliation](#paid-owner-source-and-current-provider-metadata--8-november-2026).
These observations do not establish final deployed-process behavior or a public
Data safety answer. The older inventory and its acceptance limits remain dated
evidence; the single shared legal draft is still unapproved/unpublished.

Later owner-approved update: automatic native address lookup is removed for
launch and manual fields retained/added. The mobile API refuses geocoding without
forwarding coordinates; Android config blocks all location permissions. The
earlier source inventory below is historical for that changed flow. Final signed
permission/SDK/transport acceptance remains open; manually entered addresses and
the separate web lookup path still need truthful disclosure. See the
[implementation receipt](../verification/2026-11-07-android-launch-decisions.md).
The later broad 177-country Play draft supersedes Nigeria-only targeting; it is
unsubmitted and does not establish paid-product availability. Existing
support/founders contacts and publication after approval/checks are owner-approved.
The [shared launch index](../billing/mobile-paid-launch.md) owns current decisions.
The original inventory below is dated evidence; the source reconciliation at the
end of this packet records the subsequent billing, AI and media review.

Source reviewed: `db97a0056`, current `main` checkout. **The owner corrected the
launch direction during this review: “we are not launching free.”** The 6 November
free-launch plan is superseded for launch intent. The checked-in purchase-disabled
scope is still the actual implementation; it is not the intended launch candidate.
Concurrent correction commit `a6780cb6d` confirms paid owner subscriptions at
launch, not a paid download. Do not activate billing or reuse free-only acceptance
as paid acceptance. Existing monthly NGN5k/15k/30k tiers and regional direction remain.

This is a source-backed preparation packet, not a saved Google Play declaration,
signed-build attestation, legal publication or deployment authorization. The
previous Play observation remains 10/11 setup, Draft/Internal testing, Production
inactive. No fresh Console inspection or declaration write occurred here.

## Preparation checklist and acceptance boundary

- [x] Reconcile current source collection, permissions and provider destinations.
- [x] Reconcile deletion/chat evidence without repeating completed destructive tests.
- [x] Prepare disclosure corrections and an exact remaining-evidence checklist.
- [ ] Accept the actual launch candidate, deployed controls and final declarations.

Preparation is 3/4 (75%); this is an explicitly scoped preparation denominator,
not launch readiness or measured test coverage. The old free-launch 3/6 cannot
describe the corrected commercial launch. No new signed acceptance is claimed.

## Current data inventory and draft Play classification

The category names below are proposed from actual source paths. Required/optional
and all purposes must be reconciled across every enabled flow using that category,
not just the example. `Shared`, ephemeral handling and transport are unresolved
unless supported separately. Device permission alone is not collection evidence.

| Flow and source | Data / draft category | Observed handling and remaining proof |
| --- | --- | --- |
| Authentication, account/profile, age declaration | Personal info: Name, Email address, Phone number, User IDs, Other info | Account management/functionality/security. Age range and time, not birth date. Required account facts differ by sign-in method. Confirm actual password, OTP and OAuth paths in the candidate. |
| New sale selected contact: `phone-contact-picker.ts`, `use-sale-contact-pick.ts`, `sale-contact-pick.ts` | Contacts; selected name/phone mapping also needs reconciliation with Personal info | Optional functionality. Android requests read access on tap; helper uses the native single-contact picker, not bulk enumeration. When no loaded match exists and online, national phone digits go to `orders.listPage`, and to `customers.listPage` except for scoped staff, **before customer Save**. A name/number may then populate a new-customer form and be saved through the normal customer/sale flow. Do not claim all picked data stays on-device until Save. |
| Current address: `use-current-address.ts`, API `location.ts`, `packages/utils/src/geo-address.ts` | Location: Precise location; assess Approximate location too if approximate grants/inference are actually collected | Optional functionality. Foreground current or last-known coordinates go to EwaTrade API, then six-decimal lat/lon in an HTTPS Nominatim URL. Permission is requested only on use; manual address input exists. Balanced accuracy does not prove coarse-only collection. No ephemeral claim: downstream query/log handling is unverified. |
| Explicit Open in Maps: `current-location-card.tsx`, `mapsUrl` | Location / external handoff | Google Maps receives the chosen coordinates in a URL after the user taps. Assess actual external-browser/app behavior and any applicable user-directed sharing exception; do not assume it. |
| Business/customer records, orders, ledger, manual banking | Personal info, Financial info: Purchase history / Other financial info; User payment info where actual account/payment details are collected | Free software never meant no merchant financial data. The intended paid launch adds software billing evidence. Inspect stored bank/payment fields and actual recipients; do not claim full card-number collection without evidence. |
| Software subscriptions, confirmed launch model | Purchase history, User IDs and account-linked billing references | Google Play purchase/restore, server verification, notification and refund routes require their own recipient/retention map. Native `expo-iap` remains linked but current `softwarePlanPurchases:false` prevents initialization. The scope must be reconciled and signed purchase/restore verified before declaration. |
| Store chat, reports, service requests and assistant | Other in-app messages, Other user-generated content; personal/financial facts present in submitted context | Stored conversations and assistant history are not ephemeral just because a particular moderation endpoint has limited retention. Report metadata/reasons, scope and relevant messages enter the protected case workflow. Verify active model, text moderation, vision, transcription and gateway recipients; compiled adapter support is not activation. |
| Selected image, recording, document and receipt inputs | Photos, Videos, Voice or sound recordings, Files and docs, as actually enabled | Inspect original bytes, extracted text, private storage, safety outcomes and deletion ownership. Text moderation does not certify media. Do not enable dormant media/clinical features to manufacture acceptance. |
| Customer installation binding: `customer-conversation-store.ts`, `customer-client.tsx` | Device or other IDs | Persistent app installation token is sent for credential/session binding. Absence of advertising ID is not absence of identifiers. Verify server retention and downstream propagation. |
| Global search | In-app search history assessment | Query goes off-device for functionality. Server/edge/error logging determines whether ephemeral processing is supportable. |
| Android product analytics: `runtime/analytics-runtime.tsx`, `packages/events/src/mobile-policy.ts` | App interactions, Device or other IDs; assess other actual payload fields | Requires exact Production Android identity, enabled flag and current authenticated server permission. Server-derived identity/context and session ownership now matter; old anonymous-only descriptions are insufficient. Verify candidate flags and actual output. |
| Sentry, Expo Updates, Google sign-in and other linked SDKs | Diagnostics / Crash logs / identifiers as actually transmitted | Sentry JS startup requires explicit enabled flag; checked-in Production/Preview profiles set false. Expo Updates uses the configured HTTPS project URL. Review generated native startup, update/sign-in traffic and all merged SDKs; a disabled JS flag is not proof every native component is silent. |
| Clinical/prescription features | Health info and associated media if reachable | Historical launch plans defer these; prove actual reachability/disabled controls in the final candidate. Do not omit reachable health processing based on a planning note. |

Mobile dependency inventory includes Expo Contacts 15, Location 19, IAP 3.4.13,
Sentry React Native 8, Google Sign-In, Expo Updates 29, camera/audio/image/document
pickers, secure storage, local authentication, filesystem, sharing and Blob support.
Exact resolved versions come from the candidate lockfile and native build. Current
config blocks WRITE_CONTACTS and background location. Historical Play33 manifest
facts do not establish the current permission set, Billing absence or SDK behavior.

## Draft form answers and holds

| Form field | Prepared answer / state |
| --- | --- |
| Does the app collect or share required data types? | **Yes**. Source proves multiple off-device flows. |
| All collected data encrypted in transit? | **Unresolved.** API HTTPS alone is insufficient. Inspect every native/SDK upload/update/auth path, redirects and provider transport for the exact artifact. |
| Account creation methods | Retain verified password, other authentication and OAuth draft as historical Console evidence; reconcile methods actually offered by the launch build. |
| Account deletion URL | Existing `https://www.ewatrade.com/delete-account`; current canonical legal/deletion preflight passes. Retain redirects/canonical host checks. |
| Account deletion handling | In-app request/status and public request path exist. Do not describe request receipt as completed deletion or the prior empty-data case as proof for every business owner. |
| Delete some data without deleting account? | **Unresolved operational answer.** Support, conversation and assistant controls need accepted coverage; full-account intake does not answer this optional question. |
| Shared / service-provider exception | **Per-recipient unresolved.** No blanket “not shared.” Require actual payload, recipient role and applicable agreement or clearly evidenced user-directed exception. |
| Ephemeral | **No blanket assertion.** Stored accounts/orders/chat are retained. Contact matching, search and geocoding need logs/provider evidence even when transient locally. |
| Advertising / tracking / independent security review | No new advertising purpose identified in this source review; do not certify SDK absence, tracking absence or an independent-review badge without candidate evidence. |

Google's [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
requires app and SDK practices to be covered and only allows an all-data transport
claim when it applies across collection. It also distinguishes optional collection,
ephemeral processing and specific sharing exceptions. Its
[account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
require both an in-app path and a web request resource for apps with account creation.
These sources were checked 7 November; this packet is an implementation assessment,
not a legal determination or Console certification.

## Historical geocoding review and current boundary

Public Nominatim's [usage policy](https://operations.osmfoundation.org/policies/nominatim/)
says not to submit personal or confidential data. It also sets an application-wide
one-request-per-second limit. Our API uses an in-process limiter, which does not
establish a shared limit across server instances. OSMF's
[privacy policy](https://osmfoundation.org/wiki/Privacy_Policy) describes service
usage records and possible analysis of Nominatim queries; it does not establish
ephemeral handling for this integration. The proxy exposes its own network address
to Nominatim; no claim is made that it forwards the device IP.

The owner subsequently chose manual native address entry, implemented in
cf831c187. That native decision is settled. The separate web lookup still needs
provider/retention acceptance; do not silently replace its provider, transmit test
coordinates or describe the existing service as a contracted processor.

## Deletion and chat evidence retained

- Live legal preflight on 7 November passes against approved
  `2026-10-15-adult-chat-1`, including public policy/version matching and external
  deletion-intake availability. The generic release blocker is not evidence that
  this legal publication is still missing. New contact/location/paid disclosures
  still require a separately approved immutable publication.
- The 21 October disposable Preview case was genuinely COMPLETED, nine domain
  outcomes, one recipient-matched DELIVERED notice, retention row and temporary
  access cleanup. Reuse that bounded historical proof. It had no positive shared,
  staff, sole-owner, linked-provider, clinical, commercial or subscription data;
  no additional deletion or email is authorized by this review.
- Last documented Production privacy-process binding expired 27 October. Treat
  current operating access as **unverified**, not proven expired at runtime:
  later renewal may exist. Inspect the existing dedicated operator normally before
  proposing a bounded renewal; do not grant another identity or advance a case.
- Current server source requires a signed-in ADULT declaration for free-form chat,
  rereads it within writes, and requires an active adult recipient for staff replies.
  Guest/teen/unknown refusal preserves history/report/block/support eligibility.
- Report/block source binds exact scope, authorization and retry identity;
  operator resolution is restricted. Source proof does not establish monitored
  response coverage or signed client enforcement. Ishaq is the recorded lead;
  no new staff identity or provider is appointed here.
- Shared tenant-photo erasure source added 2 November introduces an additional
  completion guard and default-off operator/job path. Preserve ownership/clinical/
  financial holds. No DB inventory, migration, sweep or merchant erasure was run.

## Minimal remaining acceptance sequence

1. Reconcile the confirmed paid subscription scope, offers, owner-only
   purchase/restore, server entitlements and Play account readiness. Use the
   [existing paid packet](../billing/android-paid-launch-offline-packet.md);
   no flags or binding agreements are authorized by this document.
2. Reconcile the remaining web geocoding and actual AI/media recipients, then
   approve exact updated privacy/paid wording. Reuse the settled native manual
   address decision and preserve prior receipts.
3. Select one frozen Android source/build/runtime and matching API/jobs/legal
   candidate. Record artifact SHA, package, signer, version, native permissions,
   SDKs and hosted feature configuration. Historical signed35 and local smoke
   receipts cannot substitute for this candidate.
4. Reuse applicable unit/history evidence; exercise the changed signed permission,
   account/privacy, adult/teen/unknown/Guest, consent refusal and report/block paths.
   Any message/report/provider call needs its permitted controlled scope. No sale,
   payment or fixtures are to be submitted to manufacture a passing smoke result.
5. Revalidate dedicated deletion operations and unresolved positive-domain/provider
   retention evidence. Prepare any exact disposable case and irreversible action
   for separate authorization; do not repeat the completed empty-data case.
6. Finish per-category collection/sharing/retention/transport answers and owner
   review, then save/submit only under the separately authorized store action.
   Keep `check-teen-release-readiness.mjs` closed until its real evidence is met.

Checks and limitations are recorded in
[the verification receipt](../verification/2026-11-07-android-safety-privacy.md).

## Shared billing, AI and media source reconciliation — 7 November

Source anchor `d01fae2c8`. This appendix serves both platforms through the existing
shared draft; it is not another release decision index. The source pass inspected
no customer data or provider traffic. A subsequent bounded read of the canonical
Production profile database found no persisted `assistant.runtime` selection;
the profile resolved to DeepSeek `deepseek-flash`. That fallback does not prove
the hosted API/jobs environment or credentials. No business/customer tables,
media, model calls or writes were involved. A supported adapter, default model or
configured secret does not prove that a particular release uses that recipient.

### Recipient and payload evidence

| Path | Source-supported recipient and payload | Target evidence still required |
| --- | --- | --- |
| Store verification | Apple Server API receives the transaction reference; Google Android Publisher receives package name and purchase token. Verified responses supply opaque owner-account binding, product, status, expiry and renewal information. `apps/api/src/billing/{apple-subscriptions,google-subscriptions,reconcile-store-subscription}.ts` | Exact signed purchase/restore and matching deployed verifier/environment. Apple hosted settings are installed but await deployment; Play merchant/product setup remains open. These paths do not collect a full payment-card number. |
| Store notifications/refund review | Signed Apple notification or authenticated Google Pub/Sub push enters the API. Google refund-review custody can retain an encrypted pending token and order ID. Errors in these routes use fixed messages rather than provider response bodies. `store-notifications.ts`, `play-refund-review-token.ts` | Actual notification delivery, refund-review operating recipient, custody and deletion schedule. Route log hygiene does not certify provider/edge/access logs. |
| Assistant text, including shared Setup/General orchestration | Server-selected DeepSeek or OpenAI adapter receives the constructed model prompt/messages. Persisted `SystemConfiguration[assistant.runtime]` wins over environment; invalid/disabled persisted config fails closed. Without a stored/env selection, source defaults to DeepSeek `deepseek-flash`, still requiring credentials. OpenAI requests set `store:false`. `packages/ai/src/{runtime-config,provider}.ts`, `apps/api/src/assistant/{model-resolution,chat-repository}.ts` | Exact deployed configuration and request construction for enabled flows. Do not infer the active provider from env names alone. `store:false` is a request option, not proof of all provider retention or an ephemeral data-safety classification. |
| Text safety | OpenAI moderation receives the screened text, using pinned `omni-moderation-2024-09-26`. Live provider selection requires the explicit moderation setting and credential, plus an approval reference in Production; response parsing fails closed. `packages/service-commerce/src/store-conversation-text-safety{,-openai}.ts` | Current target selection/approval and applicable provider handling. This text endpoint does not describe assistant generation, image analysis or speech. |
| Assistant image processing | OpenAI vision receives processed image bytes and extraction instructions; current model allowlist is `gpt-4.1-mini` / `gpt-4.1`, with `store:false`. The worker prepares the image before calling the adapter. `packages/ai/src/media.ts`, `packages/jobs/src/handlers/assistant-attachment-process.ts` | Enabled image flows, current model/key availability, provider retention and actual deployment. Image extraction is distinct from image safety screening. |
| Catalog image screening | OpenAI moderation receives a base64 WebP image under the pinned moderation model. `packages/catalog/src/photo-review-openai.ts`, `packages/jobs/src/handlers/catalog-photo-review.ts` | Reachability and deployed job/credential configuration. Supported image categories do not certify every safety category or clinical use. |
| Assistant audio | Worker replaces the simple media adapter's transcriber with the fallback router: leased Whisper gateway, then OpenAI transcription, then xAI speech-to-text. The gateway receives original audio bytes; cloud endpoints receive a multipart recording. Calls use durable attempt admission, current authority, bounded deadlines and redirect refusal. `packages/ai/src/transcription/router.ts`, `packages/jobs/src/handlers/assistant-attachment-process.ts` | Current gateway lease/operator/hosting recipient and which fallback credentials are available in jobs. Failed dispatched attempts may already have transmitted audio before another provider is tried. Neither 'OpenAI-only media' nor 'on-device voice' accurately describes this source path. |
| Assistant original attachments | LIVE storage uses private Vercel Blob; object paths contain tenant/conversation/attachment identifiers and the content digest. QA uses the local test storage adapter and is refused there in Production. `packages/private-media/src/{assistant-attachments,vercel-blob}.ts` | Matching API/jobs Blob store identity, access/transport, deployed cleanup and provider backup/log retention. A private object is still off-device collection. |
| Category suggestions / Storefront generation | Separately configured DeepSeek/OpenAI paths. Category requests contain product title, business context and allowed category paths. Storefront requests contain the constructed business brief/source text and template declarations. `apps/api/src/catalog/category-suggestion-provider.ts`, `packages/ai/src/storefront-design.ts` | Whether each feature is enabled/reachable in the launch surface; its persisted config and actual payload. The shared assistant selection does not establish these separate settings. |

QA is not universally provider-free: `model-resolution.ts` permits the existing
DeepSeek text exception for QA chats. The attachment worker uses rehearsal media
for QA. Reuse those distinct rules; do not send a chat merely to inspect routing.
This pass is bounded to the listed paths, not a complete census of sign-in,
analytics, SDKs, clinical integrations, merchant payment or messaging providers.

### Retained fields and deletion boundary

- Owner billing stores owner/account identity, SHA-256 purchase/order digests,
  product/environment, verification/expiry times, subscription state and coverage
  history. See `packages/db/prisma/models/owner-billing.prisma`,
  `packages/db/src/queries/owner-billing/purchases.ts` and `store-subscriptions.ts`.
  Digests remain account-linked data; hashing does not make the record anonymous.
  Raw store references are processed for verification. Do not turn the digest
  storage observation into a claim that tokens never leave the device or that
  every billing reference is stored only as a hash.
- Play refund-review token/order custody uses AES-256-GCM with purpose-bound AAD,
  key ID and authenticated envelope. This is a separate encrypted record class;
  it is not a retention period or proof of hosted key management. Owner billing
  tables have no automatic retention duration in the reviewed schema.
- Assistant attachment creation uses a 30-day retention timestamp. The maintenance
  handler processes at most 50 expired attachments per run, deletes the original
  bytes and confirms absence before clearing/deleting the attachment record.
  Failures retain attribution for retry. Unsent records are deleted; sent records
  clear storage references, transcript and extraction, while other row metadata
  and conversation/provenance references remain. It does not delete every chat
  message or business record containing previously accepted extracted content.
  See `packages/assistant/src/setup/attachments.ts`,
  `packages/db/src/queries/assistant-operations.ts` and
  `packages/jobs/src/handlers/assistant-maintenance.ts`.
- That worker separately selects up to 500 transcription-attempt rows older than
  90 days per run. Source cadence/limits and timestamps are not evidence that
  hosted cleanup ran, that backlog is zero, or that provider copies expired.
- Paid-owner account deletion cannot reuse empty-data acceptance. The existing
  subscription processor refuses `NOT_APPLICABLE` when an owner billing account
  or relevant coverage exists; completion rechecks that invariant. See
  `packages/db/src/queries/account-privacy-{subscription,completion}.ts`.
  The existing October disposable case therefore remains insufficient for a paid
  owner. A positive billing-retention/disposition procedure and acceptance remain
  necessary; this audit authorizes no deletion or new retention policy.

### Handoff into target verification

- [x] Trace these supported recipients, payloads and stored fields; reconcile the
  existing shared disclosure draft with the findings.
- [ ] Read the exact target's non-secret runtime selections through existing
  operator access, including persisted configuration and jobs/gateway settings.
  Record provider/model/enablement and evidence date only; never export keys,
  raw receipts, audio, prompts or customer identifiers into the packet.
  The configured Production DB's assistant selection is absent; verify hosted
  environment resolution next rather than treating the local profile fallback
  as deployed evidence. The existing status command was read-only; a second
  bounded read distinguished absence from schema refusal without printing JSON.
- [ ] Reconcile provider terms/account settings and original-storage/backup/log
  retention; inspect the frozen signed artifact's remaining SDK/transport paths.
- [ ] Prove positive paid-owner privacy disposition and actual maintenance/alert
  operations, then freeze one exact legal snapshot for the already-required
  owner approval. No blanket 'not shared', 'ephemeral', 'all encrypted' or fixed
  provider erasure promise follows from this source audit.

These are remaining evidence tasks, not a new launch-readiness denominator.
Android remains 1/8; Apple remains 2/6 at this checkpoint. The source review and
documentation validation are recorded in the
[phase receipt](../verification/2026-11-07-mobile-provider-reconciliation.md).


## Exact Android36 static transport follow-up — 8 November 2026

The [bounded SDK/transport receipt](../verification/2026-11-08-android-sdk-transport.md)
now records actual targetSdk36/default transport attributes, HTTPS Expo update
origin, native Sentry auto-init false and the unchanged source fences for analytics,
Google auth and Preview-only native installation. Eleven source paths match frozen
AAB36 source byte-for-byte. Expo launch-check NEVER does not disable the explicit
JS update flow; packaged Sentry providers and source HTTPS guards do not prove all
SDKs silent or all collected data encrypted. Exact hosted flags, gateway/provider
selection, retention and positive paid-owner deletion still need acceptance.
No source/config/declaration edit, provider send, new build or device test. The
incoming paid TestFlight/native candidate is separate; Android1/8 remains.


## Paid-owner source and current provider metadata — 8 November 2026

### Paid-owner disposition source accepted, fulfillment still open

Owner approval covers the [minimum-necessary billing policy and source procedure](../billing/paid-owner-deletion-review.md).
Commit `49df03a06` adds explicit per-category controller/necessity/basis review,
expiry or bounded hold, annual/earlier review duties, terminal checkout-link
minimization and current-source checks before profile/completion. Ordinary
workflow resumption handles late billing data, including after exact canonical
profile minimization, without restoring a login. Empty-account evidence cannot
stand in for paid records. The independent ledger survives case-evidence expiry.
The [source receipt](../verification/2026-11-08-paid-owner-privacy.md) records focused
unit, API, actual Development concurrency/JSON-join and minimized-case checks.

This supersedes the older statement that a positive source command is missing;
it does not supersede the requirement for hosted paid-owner fulfillment. The
three new retention inputs remain dormant. Three existing subscription/profile
policy prerequisites surfaced in the backend plan and were assessed as dormant
while processing is off; the release coordinator owns their configuration
classification, without fabricated policies or activation. No Production schema
application, real account disposition, provider erasure or delivered result is
accepted by this packet. Cancellation remains separate.

The inventory also covers tenant-less Paystack checkout/charge/binding/refund
journals, including when a compatibility checkout is gone. Those records can
contain customer/subscription codes, authorization/order digests, country, price
snapshots and session state. They are not universally hash-only. Separate Play
refund cases hold encrypted token/order custody; refund responses hold actor and
decision evidence. Historical/shared/unresolved scope remains blocked.

### Current settings are distinct from a deployed-process snapshot

The coordinator's [API evidence](../verification/2026-11-08-api-provider-readiness.md)
found no persisted assistant override, no API assistant/model/media overrides and
dedicated DeepSeek credential-name metadata; text safety selected
`openai-moderation` with dedicated key/approval-reference metadata. API Sentry and
Logly collector/project names were absent in that inventory. Credential validity,
actual calls, separate deployments and their runtime state were not tested.

The following additional allowlisted receipts were read directly. Times are WAT
(Africa/Lagos), on 8 November. No credential value, customer record, model request,
provider health probe or setting mutation was used.

| Read | Exact observation | Limit |
| --- | --- | --- |
| Trigger `proj_ahtovhgtjjkctpakuwjz` / `prod`, 17:05:37 | `APP_ENV=production`; `DEV_PROFILE` absent. | Current environment entries, not proof of the deployed worker version or its in-process values. |
| WhatsApp worker selectors | `ASSISTANT_WHATSAPP_ENABLED=true`; `ASSISTANT_WHATSAPP_MEDIA_ENABLED=false`. | These switches govern that channel; they do not settle other in-app uploads or generation recipients. |
| Manual receipt selectors | `MANUAL_RECEIPT_PROCESSING_ENABLED=false`, `MANUAL_RECEIPT_PROCESSOR_APPROVED=false`, `MANUAL_RECEIPT_WORKER_ADMITTED=false`; `MANUAL_RECEIPT_MODEL` absent. | This processing route is configured off. It does not prove receipt originals are never uploaded/stored or that all media features are off. |
| Audio/gateway | `ASSISTANT_TRANSCRIBE_MODEL` absent in the Trigger reads. Exact Production DB read at 17:07:07 found no `assistant.voice.gateway.v1` row or active lease, and no `assistant.runtime` row. | No eligible gateway lease at that observation. Cloud fallback credential/route availability and actual worker process remain unproven. |
| Analytics selector in jobs | `NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED=true`. | A dashboard-named flag in jobs does not establish Android collection or API forwarding; the separate client/forward settings still need acceptance. |
| Owner billing worker selectors | `OWNER_BILLING_ENABLED` and `STORE_BILLING_ENVIRONMENT` absent. The observed source sync allowlist omitted owner-billing inputs. | API-only settings cannot establish worker coverage/projection; worker cutover acceptance remains open. No flag was enabled to manufacture it. |

Private receipts: `/private/tmp/ewatrade-apple-trigger-selectors-2026-11-08.json`
and `/private/tmp/ewatrade-apple-provider-selection-2026-11-08.json`. The previous
API inventory and this later exact-key DB read retain their own observation times.
Do not re-label either as the final Ready release's effective environment.

### Provider and declaration interpretation

The official [DeepSeek API reference](https://api-docs.deepseek.com/api/deepseek-api/)
links its [Open Platform Terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html),
released 22 April/effective 29 April 2026. Sections 3.3/5.5 place downstream notice
and rights responsibilities with the developer and describe provider cooperation.
This identifies API-specific terms, not this project's accepted contract, fixed
API retention, residency or completed erasure. Do not infer API training behavior
from consumer wording or secondary commentary alone.

Official [context-cache documentation](https://api-docs.deepseek.com/guides/kv_cache/)
describes default disk caching of request prefixes and typical clearing of unused
cache within hours to days. That is not a maximum for logs/backups/all API data,
or evidence of memory-only real-time processing. No API call was sent.

Google's [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
includes pseudonymous data, SDK transfers and controlled webviews; the
service-provider exception depends on actual processing on the developer's behalf.
Its payment FAQ distinguishes inaccessible card data collected directly by a
payment service from purchase/fraud data the app receives. These are conditional
rules, not a blanket no-sharing, no-financial-data or all-encrypted answer.
The [deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
require the in-app/external request paths and clear explanation of legitimate
retention. Policy/source approval does not certify hosted completion or provider
erasure. No Console declaration was saved or submitted in this reconciliation.

### Next acceptance boundary

The archived private iOS build 8 is accepted for remote compilation as
`e699c62f-4db6-4614-ae7c-2181d713bc2e`, source
`8f158ba9fa7fa815a1ea7927ee63649404bd92cb`; it is not yet a compiled/TestFlight
or paid-flow acceptance in this packet. The Android36 equality/manifest receipt
remains scoped to that frozen artifact; later config/source changes do not inherit
its byte-equality claim. No new native test was repeated for these docs.

Still required: final Ready API/worker/source and effective selectors; actual
worker coverage; signed Android recipient/SDK/transport scope; applicable provider
roles/account retention and storage/cleanup operations; paid-owner fulfillment
and reviewed delivery. Then freeze one complete immutable legal snapshot for
exact-content approval and complete the store declarations. The existing shared
draft was updated in place only. Preparation remains 3/4; Android 1/8 and Apple
2/6 are unchanged here.

[Documentation checkpoint receipt](../verification/2026-11-08-privacy-disclosure-reconciliation.md).


## Signed SDK and corrected backend follow-up — 8 November 2026

### Exact signed iOS builds 8 and 10 SDK evidence

The coordinator verified build 8's IPA signature, team and provisioning profile
and uploaded it to Apple. The private manifest extraction contains 20 manifests.
Only the root and GoogleSignIn bundle have collected-data rows: root 14, SDK 8,
with 16 unique types across the extraction. All collected rows are linked; the
extracted manifests declare no tracking=true entry. Those are declarations, not
a packet observation or proof of every possible runtime behavior.

GoogleSignIn 9.2.0 was verified from the artifact's Info.plist. Its manifest is
separate from the app's root manifest:

| SDK-declared data type | Declared purposes | Linked / tracking |
| --- | --- | --- |
| Name, EmailAddress, PhoneNumber, CoarseLocation | App Functionality | Linked=true; tracking=false |
| OtherDataTypes, UserID | App Functionality and Analytics | Linked=true; tracking=false |
| DeviceID, OtherUsageData | Analytics | Linked=true; tracking=false |

The root's 14 rows declare App Functionality and tracking=false; that root alone
does not summarize the SDK's extra coarse-location/usage and analytics entries.
Google's official [iOS disclosure guidance](https://developers.google.com/identity/sign-in/ios/app-privacy)
says the SDK may collect a user identifier and use an IP address to estimate
general device location for fraud prevention. No location usage keys in this IPA
is therefore compatible with IP-derived SDK location. Do not infer no approximate
location from the app's manual-address feature or permission removal.

Apple's [manifest guidance](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests)
allows SDK data to be declared in the SDK's own manifest and describes aggregating
the app and linked SDK manifests for a privacy report. This finding does not by
itself require duplicating SDK types in the root manifest or rebuilding native
code. Reconcile the actual combined purposes in the final Apple label.

Source `use-mobile-google-auth.ts` uses native GoogleSignin on both iOS and
Android, with email/profile scopes and offlineAccess=false; web alone uses
AuthSession. This source check is not a new sign-in test or proof that every SDK
declaration is exercised in every flow. Google's [core Play services disclosure](https://developers.google.com/android/guides/play-data-disclosure)
covers base/basement/OSS licenses/tasks, not authentication. Its no-data statement
must not be generalized to Android Sign-In, and the iOS plist is not an Android
Data safety answer. Android SDK/version and invocation scope remain separate.

Private evidence: `/private/tmp/ewatrade-ios-build8-privacy-manifests.json` and
`/private/tmp/ewatrade-ios8-sdk-disclosure-extract-2026-11-08.json`, which binds the
extraction SHA-256, build ID and source. The Google/Apple guidance was checked
8 November. No network capture, provider/auth request, tracking authorization or
store declaration was performed by this documentation pass.

### Replacement candidate and backend acceptance boundary

Physical build 8 accepted login/Free usage, including the owner's later password
login confirmation against current Production. Paid controls were absent because
the iOS-specific provider/panel entrypoints overrode the shared native code with
no-op implementations. The coordinator corrected those entrypoints and the
signed-notification verification dispatch. Those source fixes do not establish
signed paid UI, purchase or restore acceptance. Reserved build 9 failed before
archive/cloud acceptance; it has no accepted artifact ID.

The accepted replacement is build 10,
`50f69a74-5dae-4d0a-b481-9ad6164146f4`, source
`2d4424b1525c4aa05e6ced39ce888e31d7f8140e`, store distribution and the private
Production TestFlight profile/channel. Archive acceptance/source fingerprint is
confirmed. Build 10 subsequently finished, and the coordinator verified its IPA
signature/profile/bundle/team, Production origins, StoreKit/native IAP markers
and GoogleSignIn 9.2.0. IPA SHA-256:
`eb80bdb6c4bf52a93ab27ea4fe6cc52fec3c7a4bd1a201f33dfbaa9c00b63354`.
Runtime `018c6c66e7e614408870451b744e5befac86a851` matches build 8; no native
location usage keys are present. All 20 privacy manifests are structurally
equivalent under normalized list/set semantics. This lane independently compared
the two extracted JSON sets ignoring array order and confirmed equality. The
build 8 SDK disclosure evidence is therefore bound to this exact build 10, not
merely assumed from source. Native paid UI, purchase and restore remain pending.
The App Store upload is running at this checkpoint, not accepted processing or
physical paid acceptance. No native change was made by this privacy lane.

Private new receipts: `/private/tmp/ewatrade-ios-build10-signature-receipt.json`
and `/private/tmp/ewatrade-ios-build10-privacy-manifests.json`. The manifest JSON
SHA-256 is `fa0dfdfccf8c24d13255acfc20b6c982d8205c428cf9b8f50dc5579a714f3b12`.

The coordinator reports matching Preview API and web smoke passed with
`runtimeVerified=true`: Dashboard `dpl_vt2bS6JSDdnbQgWc18Ythchhd11q`, API
`dpl_GVYSQNTJUaG6YjFQ4kAFAYuDsRc9`, at 18:28:43 WAT. Canonical Production at the
same candidate completed with API `dpl_CRXkzyZQrtHSew3SWAFeuhv1tRyT`, matching
canonical alias and health200. The prior genuine captured signed Sandbox TEST
replay now returns 200/received; the earlier source `2e1ee7e72` returned503.
These connected checks belong to the release coordinator and were not repeated.

That replay proves the deployed verifier accepts that genuine signed input; it
is not a fresh Apple delivery to the intended configured URL. The attempted
Sandbox URL save encountered an Apple error followed by browser/interruption
failures. The saved URL is UNKNOWN pending authoritative readback; no fresh
canary or purchase was accepted. Root owns that provider/UI reconciliation and
exact build 10 upload/native IAP testing. No privacy settings were activated.

Current API/Trigger/DB configuration observations earlier in this packet retain
their own timestamps. A new Ready API does not retroactively turn them into an
in-process provider/worker snapshot. Worker billing projection, applicable
recipient roles/retention and cleanup, positive privacy fulfillment/notice,
signed Android scope and final declarations remain open. Separate worker read-
projection allowlist source work does not establish hosted activation. The single legal draft
was updated in place, without publication or effective approval metadata.

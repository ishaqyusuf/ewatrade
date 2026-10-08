# EwaTrade iOS privacy and reviewer packet — 7 October 2026

Prepared from source at `c9927cbd` in draft PR [#57](https://github.com/ishaqyusuf/ewatrade/pull/57).
This is an inventory for the candidate review, not saved App Store answers or
signed-build verification. Preparation3/6; release acceptance0/4.

## App Privacy inventory

The app-owned manifest declares the following linked data for App Functionality,
with tracking false. Confirm each against reachable flows and network/storage
evidence from the exact candidate before saving the App Store questionnaire.

| Apple category | Declared data | Candidate evidence to collect |
| --- | --- | --- |
| Contact Info | Name, email, phone, physical address | Signup, profile, business/customer and delivery/service records; optional fields still need an accurate answer when collected. |
| Identifiers | User ID, device ID | Authentication, workspace attribution and conversation/device credentials; confirm identifier handling and all provider recipients. |
| Financial Info | Payment info, other financial info | Merchant payment/ledger and money-account flows; distinguish operational records from a store software purchase and do not imply full card collection without evidence. |
| Purchases | Purchase history | Reachable merchant sales/orders and any store purchases actually enabled in this build. First-release software subscriptions are deferred. |
| User Content | Emails/text messages, photos/video, audio, other user content | Store chat, service intake and user-selected attachments; verify actual storage, moderation, reports and deletion. |
| Other Data | Other data types | Age range/time and other account/business metadata. Age declaration is a range, not a date of birth. |

Source references: `apps/mobile/app.config.ts` (14 manifest data types), auth and
Store/service flows, and the effective legal documents in
`packages/utils/src/legal-documents.ts`. These source declarations do not establish
that every declared flow is enabled or that SDK data is fully covered.

Apple requires disclosure of both the app's practices and its integrated partners:
[Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy).
Use the exact build's Xcode aggregate privacy report to check SDK manifests and
required-reason APIs: [privacy manifests](https://developer.apple.com/documentation/BundleResources/describing-data-use-in-privacy-manifests).

## Provider and SDK verification

- OpenAI text adapter sends only input text and the pinned moderation snapshot;
  account/profile IDs are omitted. It serves both catalog publication and Store
  text screening. Owner approval exists, synthetic live checks5/5 pass, and
  Production activation remains pending. Disclose the active moderation purpose
  and provider before customer traffic is enabled.
- The iOS product-analytics runtime is currently excluded by an Android-only
  condition in `apps/mobile/src/runtime/analytics-runtime.tsx`. Production local
  profile sets `EXPO_PUBLIC_LOGLY_ENABLED=false`. These are source/local-profile
  facts; verify the hosted EAS environment and candidate behavior separately.
- Sentry initialization requires `EXPO_PUBLIC_SENTRY_ENABLED=true`; that flag is
  absent from the inspected root/Preview/Production local files; both Preview and
  Production profiles in `apps/mobile/eas.json` explicitly set it false and disable
  source-map upload. Shared options
  disable default PII, replay, logs and traces and rebuild error events. SDK/native
  crash behavior, embedded config, hosted variables and server-side diagnostics
  still need verification. Do not certify Diagnostics as absent just from a flag.
- Apple/Google sign-in, Expo Updates, secure storage, file/image handling and
  other native SDKs must be included in the build's dependency/privacy report.
  Installed AsyncStorage and Expo FileSystem have privacy-manifest source files;
  installation alone does not prove the report or actual collection.
- No advertising/ATT purpose is declared by app-owned source. Confirm absence of
  cross-company tracking and SDK exceptions before saving the tracking answer.
- Text moderation's endpoint retention controls do not establish geographic
  consent handling or image/audio safety. Worldwide13+ remains the intended
  scope; regional child/teen requirements and signed access paths are unfinished.

## Permissions to verify on-device

| Permission | Source purpose | Acceptance |
| --- | --- | --- |
| Camera | Product barcode scans and chosen photos; service intake | Trigger only from the chosen flow; verify grant, denial and recovery. |
| Microphone | Chosen Store voice note and service intake video | Verify explicit recording, cancellation, upload/safety handling and denial. |
| Photos | Chosen service intake attachments | Verify limited-library access and denied permission. |
| Face ID | Unlock the user's workspace | Verify local authentication, fallback and no biometric data leaving the device. |

Purpose strings originate in the Expo plugins in `app.config.ts`. Review generated
Info.plist and all additional native permissions in the signed binary. Native
permission/SDK changes need a new binary, not only an OTA update.

## Reviewer access

Use the existing synthetic **EwaTrade Review Demo** early-access request; do not
create a duplicate. The connected founders inbox contains its request receipt and
admin notification. Approval/private setup, mailbox OTP, stable password login,
synthetic workspace contents and signed-client access remain unverified.

The owner clarified that no Production account exists and will register with his
company email. The spelling must be confirmed rather than inferred from voice.
The retained Chrome handoff is at the public Request early access form, which
sends an approved private setup link after approval. No new request was submitted
and no signup, verification or authenticated session is claimed. The earlier
founders-address request is historical, not evidence of an existing account.
The owner must enter any new password in the private setup flow and save it in
their password manager. Never place passwords, OTPs or
private invitation/approval links in the repository, Brain, chat or screenshots.
Never create a direct DB User or mark email verification manually.

Draft reviewer instructions, after signed acceptance:

> Launch EwaTrade and choose “Use a password instead.” Sign in using the credentials
> entered in the restricted review fields. Open “EwaTrade Review Demo” to inspect
> Catalog, Orders, Staff and the available workspace features. All records are
> synthetic. No purchase or clinical/prescription workflow is required for the
> first free release.

Confirm that every reachable feature is reviewable. If customer chat requires a
different account/role, provision a separate ordinary synthetic customer account
and verify it rather than claiming the Owner account covers that path. Keep
credentials in the restricted store console only after their actual acceptance.

## Candidate screenshots and submission

Capture real screenshots from the accepted candidate for catalog, orders and the
primary workspace, using only synthetic records. Check exact device-size/image
requirements in the store console at upload time; no screenshots have been
fabricated or uploaded here. Privacy/age/content-rights answers, final reviewer
credentials, TestFlight upload and review submission remain pending.

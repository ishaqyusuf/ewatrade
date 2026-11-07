# Android launch choices — 7 November 2026

Owner approved the recommendations: manual address entry, Nigeria-first Play
availability and existing support/founders contacts. Public release after Google
approval and required checks is authorized. Payments profile remains owner-handled.

## Delivered

- Removed native current-location controls and unused location hook/card. Signup
  now has optional street address, city and state/region inputs; new-business
  retains its existing address and city fields. Country/currency selection and
  existing saved records remain unchanged.
- `location.reverseGeocode` preserves its request/output type for older clients
  but returns FORBIDDEN before provider or database access. Malformed coordinates
  still fail validation. The separate shared web lookup remains outside this
  Android change and is not evidence of an app-wide no-location policy.
- Android Expo config blocks COARSE, FINE and BACKGROUND location. Production
  config introspection succeeds, identifies `com.ewatrade.app`, and generates
  `tools:node="remove"` entries for all three. The IAP plugin is present. This
  is config evidence, not a merged signed artifact or native device acceptance.
- Authenticated Play Console: original Production targeting showed178 countries/
  regions. Cleared the selection, retained Nigeria and saved. Publishing overview
  confirms **Add 1 country / region: Nigeria** under changes not yet submitted.
  Send app for review is disabled until required setup is complete. No release,
  declaration, subscription offer, financial profile or other pending draft was
  submitted. Production remains inactive; managed publishing was already off.
- Existing public `support@ewatrade.com` and forwarding `founders@ewatrade.com`
  are reused. October9 routing/receipt evidence is historical; no new mailbox,
  live test email, alert flag or response-coverage claim is made. Founders is the
  approved alert recipient plan; backup and response-time acceptance remain open.

Private country evidence: `/private/tmp/ewatrade-android-launch/nigeria-publishing.png`.
Console: https://play.google.com/console/u/0/developers/9017957593475991384/app/4972793687190568960/publishing

## Verification

Offline doctor passes. Focused router/business-country checks pass3tests/11assertions.
The router regression verifies that valid old-client requests are refused and
no outbound fetch or DB access occurs. Invalid coordinates remain BAD_REQUEST.
Production Expo introspection passes. API and Mobile TypeScript checks pass.
Owned-path fast smoke passes259tests/1,679assertions plus QA tooling types and
changed-file Biome, with no unsupported mappings. H01 coverage and H02 impact
pass; no capability/procedure rows changed. H02 evaluates the shared dirty
checkout, so this record documents only this Android permission decision and
does not accept the concurrent auth work. No schema or migration changed.

Initial API types found Bun's `fetch.preconnect` requirement on the new test
double; the double now preserves that API and the final type/test runs pass.
H02 initially requested a permissions documentation decision; the record and
local permissions contract were added. No check was suppressed or bypassed.

Source review confirmed no remaining native current-address hook/card or
location SDK call. Reuse unchanged billing, deletion and safety evidence; no
payment/sale, positive-data deletion test or unnecessary connected matrix ran.
Current native UI/signed permission acceptance is still required. A01–A08 stays1/8.

The release coordinator's last executor had stopped before this owner-directed
slice began. Root Agent Chat records the changed scope. Concurrent password
recovery work is foreign and excluded from this task's stage/commit/check scope.
No worktree, branch switch, push, deployment or runtime activation occurred here.

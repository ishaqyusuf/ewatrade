# Apple Production authorization evidence — 9 November 2026

Status: evidence review and conditional read protocol only. **No new Apple/API/
database/native call, TEST request, receipt, charge, key/credential change or
deployment.** Do not execute the proposed read before coordinator review. Apple
stays2/6 (33.3%); current phone-ready and Apple web-login handoffs remain with root.

## What the saved evidence establishes

| Evidence | Established fact | Limit |
| --- | --- | --- |
| Original installed purchase at19:26Z8November | Gateway verifyPurchase returned400 and related callback503; owner saw awaiting-verification feedback. | Generic hosted errors did not expose an Apple401 response or exact credential cause. |
| Local actual-SDK replay of the genuine signed purchase | Full Sandbox notification verified; Production-first subscription lookup failed HTTP401/apiError=null. Switching only lookup environment to known Sandbox made transaction/status verification pass with the same approved local file key. | This is operator replay evidence; it did not establish byte equality with hosted sensitive keys, retain a positive Production response or diagnose why Apple returned401. |
| Approved Sandbox TEST/history/transaction/status and later hosted purchase recovery/Restore | Positive authenticated Sandbox operations and working hosted Sandbox verification, with original owner binding and durable Sandbox facts retained. | Positive Sandbox auth is not positive Production authorization. Signed notification verification itself is not a Production API credential test. |
| Commercial/identity metadata | Paid Apps Agreement, bank/tax/DSA Active at the accepted readback; app/native identity registered; first app release was still pending at the failed lookup. | Agreement status, Apple web-session login and App Store Connect operations do not individually prove App Store Server API Production authorization. |

No positive Production App Store Server API authenticated response was found in
the inspected saved receipts. The historical HTTP401/apiError=null is recorded
in the [purchase diagnosis](2026-11-08-apple-purchase-verification.md); a raw
response body/header/JWT-clock comparison is not established by those sanitized
facts. Do not infer that the exact body was empty merely from apiError=null.
Some private replay error files have subsequently changed; do not reinterpret a
newer file's missing401 as evidence the earlier recorded failure did not occur.
Production EwaTrade API health or webhook HTTP200 is not a positive authenticated
response from Apple's Production App Store Server API; the two servers and claims
must remain distinct.

## Primary-source support, without claiming the specific cause

An [Apple App Store Commerce Engineer](https://developer.apple.com/forums/thread/806452)
states that Production API access requires a Production release. That supports a
platform-limited prelaunch explanation, not a diagnosis of this app's particular
401. The forum's later fallback/timing advice is from a non-Apple participant and
is not adopted as authority for401→Sandbox fallback.

In [Apple's SDK issue60](https://github.com/apple/app-store-server-library-node/issues/60),
a repository collaborator says lack of a Production release *may* explain401 and
explains why a non-JSON error response can leave only the HTTP status. It does not
prove our local/hosted key equality, JWT timing or exact cause. Our confirmed bug
was **trying the wrong first environment for an already server-authorized Sandbox
reviewer**. The fix selects that known environment before I/O; it does not treat
401 as transaction-not-found or relax ordinary Production authorization.

Apple's [API environment guidance](https://developer.apple.com/documentation/appstoreserverapi)
requires matching known transaction environments and documents4040010 retry only
when the environment is unknown. Preserve current rejection of auth errors; never
generalize the reviewer's explicit server policy into an ordinary401 fallback.

## Is another prelaunch Production probe useful now?

Not as a definitive credential-validity test. With no accepted first Production
release, another401 from a read-only endpoint would still be compatible with the
documented platform prerequisite as well as invalid credentials/JWT. Repeating it
would not distinguish those explanations. Do not create a TEST, invent a receipt,
rotate keys or publish the app merely to get a different status.

Use the existing successful Sandbox evidence and approved key/issuer/bundle custody
for prelaunch readiness. Keep **Production authorization unobserved/platform-limited**
explicitly separate from **credentials proven invalid**; neither assertion implies
the other. Coordinator should account for this first-release dependency in final
rollout, rather than invent an impossible prelaunch requirement for a Production
transaction or a second platform score. A bounded read after confirmed eligibility
can close the Production-auth observation without a customer purchase.

## Smallest conditional Production read — prepare, do not execute

Only after a confirmed first Production release, or authoritative app-specific
Apple clarification that this endpoint is eligible earlier, and coordinator review
of this exact read scope:

1. Reuse the approved existing In-App Purchase key in private custody and the
   pinned official Node SDK3.1.0, registered bundle and approved issuer/key identity.
   Check selected profile/custody and UTC timing without printing key/JWT values.
   Do not substitute an App Store Connect web cookie, another key, guessed receipt
   or another app. Compare hosted values only through an approved safe mechanism;
   a local file-key pass alone is not hosted-secret equality.
2. The SDK's existing Production base is https://api.storekit.apple.com. Call
   **getNotificationHistory(null, {startDate,endDate}) once**, whose HTTP path is
   POST /inApps/v1/notifications/history. Despite POST, this endpoint reads history;
   it does not request or deliver a TEST.
3. Choose one closed one-second UTC window within the allowed180-day retention,
   preferably immediately before the first-release time when known. Empty is the
   expectation, not an invented guarantee. Require startDate<endDate; omit all
   transaction/type/subtype filters and paginationToken. Read one response page
   only, maximum20 entries; no pagination, history census or Sandbox retry. The
   later reviewed operator wrapper must enforce a15-second abort and reject
   redirects while preserving the SDK's fixed Production request/auth handling.
4. Record safe request time/window, environment/SDK/host, HTTP status, structured
   API error if supplied and count/hasMore only. Do not print/store response JWS,
   transactions, Authorization headers or cookies in the public receipt. Nonempty
   history is not a lifecycle test; do not reconcile or replay it.

Endpoint semantics, limits and401 are documented in
[Get Notification History](https://developer.apple.com/documentation/appstoreserverapi/get-notification-history);
required dates are in [NotificationHistoryRequest](https://developer.apple.com/documentation/appstoreserverapi/notificationhistoryrequest).
Use the SDK's existing five-minute ES256 JWT generation; validate claims against
[Apple's JWT requirements](https://developer.apple.com/documentation/appstoreserverapi/generating-json-web-tokens-for-api-requests),
including matching kid/iss/bid, appstoreconnect-v1 audience and iat/exp timing. No
manual JWT exposure or key generation is necessary. This is a conditional plan,
not an executed or currently recommended prelaunch probe.

| Result | Permitted conclusion / next boundary |
| --- | --- |
| HTTP200 | Production authenticated history read accepted for that exact app/key/context/time. Does not prove a real Production purchase, lifecycle or hosted key equality if run with an operator file key. |
| HTTP401 before release eligibility | Ambiguous/platform-limited; cannot label credentials invalid or accept Production auth. Do not retry or fall back. |
| HTTP401 after confirmed eligibility | Auth failure needs exact kid/issuer/bundle/key status/permissions/JWT timing investigation; still do not rotate keys or infer transaction absence automatically. |
|400/404/429/5xx or transport failure | Record the exact protocol/resource/rate/outage result; no positive Production credential claim. Stop, no automatic additional call or TEST. |

## Verification and Brain impact

Preparation inspected saved sanitized outcomes, prior commercial readbacks, private
runner source (not executed), current pinned SDK endpoint/JWT generation and
primary documentation. No private key, live credential/JWT, Apple account page or
provider/database runtime was queried. Owned-document checks/source links qualify
the plan only: offline doctor; three-owned-document quick51tests/254assertions plus
QA types; SDK method/host/JWT, unchanged billing source, links and diff assertions
pass. Private audit: `/private/tmp/ewatrade-i03-followup-source-review-2026-11-09.evidence.json`,
mode0600. No Production credential test was executed.
Brain: local `.brain/features/native-store-billing.md`,
`.brain/features/owner-wide-billing.md`, `.brain/tasks/in-progress.md`.

# I03 configuration evidence audit — 9 November 2026

Status: finite checklist/protocol review only. I03 remains In progress and the
platform score remains **Apple2/6 (33.3%)**. No new deployment, native/provider/
database call, grant, fixture, purchase, account switch, gateway or flag change.
The coordinator owns the pending fresh-phone observation and Apple web sign-in.

## Requirement authority and accepted evidence

The original I03 row in `docs/billing/apple-paid-launch-2026-11-07.md`, created at
220e40277, requires target proof of secure API-key custody, exact environment,
notification delivery, owner coverage/cutover and native linkage. The adjacent I05
row separately requires signed purchase/Restore/lifecycle/account-business
switching and retained-record/admission behavior. The current
[I03/I05 ledger](../billing/apple-paid-launch-2026-11-07.md#paid-apple-checklist)
has accumulated some I05 QA carryover in I03's status text; it does not justify
testing the entire money/lifecycle matrix twice.

The separately owner-approved
[reader activation scope](2026-11-08-billing-reader-job-config.md) explicitly calls
for actual same-scope paid/Free reads. That narrow postcondition must be accounted
for honestly rather than treating disabled Preview output as a Free result.

| I03 configuration assertion | Exact requirement / supporting record | Current evidence and conclusion |
| --- | --- | --- |
| Approved Apple verifier key custody and working signing/lookup | Original I03 secure API-key custody; hosted configuration and [signed candidate](2026-11-08-production-testflight-paid-candidate.md) | Existing approved key in private custody, sensitive API settings installed by reviewed helper without new credentials. Genuine signed original Sandbox purchase lookup/reconciliation succeeds under the corrected reviewer policy. Production authorization is not proved by Sandbox success; [credential evidence](2026-11-09-apple-production-auth-evidence.md) separates the historical401 and prelaunch platform limit. No key rotation or repeat canary is implied. |
| Registered native identity and StoreKit/ExpoIap linkage | Original I03 native linkage; [entry-point receipt](2026-11-08-ios-billing-entrypoints.md) and signed candidate | Exact installed10/2d/EAS50f69a74 signed artifact, registered bundle/team, Production origins, StoreKit/ExpoIap/OpenIAP linkage, actual three monthly offers and native purchase entry pass. Native finish-return is a separate I05 observation, not another linkage gate. |
| Product/environment mapping and closed public checkout | Original I03 exact environment; [controlled review design](2026-11-07-apple-review-sandbox.md), candidate configuration receipt | Three Apple product mappings, Preview Sandbox / Production Production settings, explicit public-checkout false and immutable reviewer1 policy accepted. Genuine purchase remains Sandbox in durable state; ordinary/Google/wrong-owner refusal has existing source/integration evidence. Do not infer public checkout activation or real revenue. |
| Correct Apple notification destinations and verified receiver | Original I03 notification delivery; [callback receipt](2026-11-08-apple-build8-callback.md) | Both saved Apple destinations point to Production gateway after reload. Genuine previous TEST replay200 and fresh Apple Sandbox TEST SUCCESS establish signature/bundle/receiver delivery. Accepted receiver proof, not ordinary relay or lifecycle proof. |
| Reviewer owner binding and owner-coverage cutover | Original I03 owner coverage/cutover; [purchase receipt](2026-11-08-apple-purchase-verification.md) | Initial pre-purchase/cancel API state was Free/no grant; original signed Starter recovered to the same immutable owner with Sandbox environment retained. Explicit enrollment and one Restore preserve original purchase/period/coverage, one owner slot, no duplicates. Accepted basic configuration/cutover. First-tap feedback and further transitions remain I05. |
| Actual paid reader configuration across API / Dashboard / jobs | Approved reader activation's actual-runtime paid read; [hosted task](2026-11-09-billing-reader-job-check.md), [Settings server result](2026-11-09-dashboard-server-plan-result.md) | API/purchase reads accepted; actual hosted jobs e162/version20261109.2 returned Starter/owner_subscription; actual authenticated full-reload Settings b0 returned resolved/starter/owner_subscription at14:21:03.995Z. Accepted licensed paid parity. No independent optimized-shell proof is required by I03. |
| Actual ordinary Sandbox gateway→Preview relay | Current I03 status notes leave it open; controlled review design requires isolation and fixed one-way forwarding | **Unexecuted, not accepted.** Recommend treating nonreviewer Sandbox traffic outside the current one-reviewer launch-critical configuration scope, with source/integration isolation proof. Current route may forward it to Preview, never grant Production Sandbox access. Scope reasoning below does not invent a positive dispatch or change the score. |
| Actual Free reader postcondition | Approved reader activation: verify actual same-scope paid/Free reads | **Open for Settings/jobs.** API's genuine pre-purchase Free/no-grant case passes. Hosted Preview disabled result contains no plan; source/integration Free assertions are not actual hosted Free reads. Satisfy this narrow read postcondition once in a legitimate existing Free state; reuse the same genuine state/observation for I05 rather than repeating the lifecycle. |

The audit does not reopen accepted passes because the Apple web console session
later needs normal sign-in. That session is distinct from the accepted verifier-key
custody/runtime evidence. Facts retain their recorded times/targets; no fresh
commercial/provider read is claimed here.

## Items that remain open elsewhere, without new I03 gates

- I05: native finish-return; first-tap enrollment feedback; further covered/
  uncovered/released and account/staff/business separation; renewal, failure/
  grace/recovery, cancellation/expiry and refund/revocation; retained data and new
  admission limits. The fresh build10 message protocol can accept its bounded
  positive finish-return observation without global queue inventory.
- I04/I06: effective paid policy/privacy and operational facts, declarations,
  candidate screenshots/review credentials and final submission/approval.
- A proof-boundary note that Settings does not separately prove the optimized
  shell is not a new acceptance requirement. Neither an unfinished-queue-empty
  assertion nor another full I05 lifecycle matrix is an I03 configuration gate.

The Free-reader item above is only the declared runtime read result, not a second
copy of every Free/retention/lifecycle requirement. The
[named Release → Free → re-enroll proposal](2026-11-09-coverage-release-free-reenroll.md)
is a legitimate coverage scenario that can share its Free window across I05 and
the actual-reader postcondition. It is prepared, not executed; it does not simulate
expiry, grace or refund. Do not change flags, transfer ownership, create fixtures
or force expiry. No new owner question is issued before the pending finish case.

## Why existing genuine TEST cannot prove the current relay branch

At deployed b0, `apps/api/src/billing/store-notifications.ts` fully verifies the
envelope, classifies it, then immediately returns received:true for kind=test.
Only non-TEST notifications proceed to required signed transaction/account token,
reviewer lookup and ordinary Sandbox forwarding. The same files have no source
diff from b0 to this audit's HEAD.

`apple-notification-delivery.ts` already enforces the fixed Preview destination,
Production profile/environment/forward flag, POST of the original signedPayload,
redirect:error, 5-second timeout and <=1KB HTTP200/received:true acknowledgement.
Existing route/transport tests cover guards, owner routing, failures and Preview
no-relay. These are accepted source evidence, not an executed Production relay.

Saved mode0600 custody inspected without printing payloads/identities:

- `/private/tmp/ewatrade-apple-gateway-canary-2d4424b1.private.json` contains the
  genuine previously verified Apple Sandbox TEST at status.signedPayload. Saved
  companion evidence records receiver SUCCESS and ordinarySandboxRelayAccepted=false.
- `/private/tmp/ewatrade-apple-sandbox-canary-6a4948c8.private.json` retains another
  genuine TEST; it supplies no ordinary transaction.
- `/private/tmp/ewatrade-reviewer-apple-purchase-capture.private.json` retains one
  previously fully verified SUBSCRIBED envelope, exact reviewer binding. It must
  not be relabelled ordinary, modified, forwarded directly to Preview to force a
  result, or replayed as another purchase test.

The saved history capture inspected one matching reviewer notification; it is not
a census proving no ordinary transactions can ever exist. No eligible existing
ordinary payload is established in this task's custody. A non-TEST relay reaches
Preview reconciliation and can write; an arbitrary transaction cannot be promised
to be a no-grant test. No new history scan or Apple TEST request is authorized by
this preparation.

Direct TEST to Preview would repeat receiver evidence. Running the relay helper
locally with a Production profile could prove narrower operator-to-Preview
transport but would not prove execution of the hosted Production gateway. Neither
may be labelled an actual ordinary gateway-route pass.

## Launch-critical scope versus unaccepted ordinary Sandbox traffic

Coordinator requested this scope review rather than a TEST behavior change. The
prior TEST-forward canary proposal is **not selected and must not be implemented
to manufacture an ordinary-transaction pass**. Current TEST acknowledgement stays
unchanged; no new gateway/flag/deployment is proposed as the next action.

Recommended classification for coordinator reconciliation:

- The approved private TestFlight/review scope names one immutable reviewer owner
  and the existing one-tester group; its Sandbox purchase/receiver/cutover have
  actual target evidence. Public paid transactions use Production, not an
  ordinary user's Sandbox receipt.
- Ordinary Production clients cannot choose the review exception. The configured
  environment, immutable reviewer rule, full signature/bundle checks and existing
  source/Development integration preserve denial of ordinary Sandbox grants in
  Production. This is the relevant isolation configuration boundary.
- Do not call the whole notification route inactive or always denied: the current
  enabled relay may forward a genuine nonreviewer Sandbox event to isolated
  Preview. No eligible ordinary target has been established; live real-transaction
  dispatch remains explicitly unexecuted. Preview reconciliation can write if a
  legitimate Preview binding exists, so arbitrary replay is not a no-grant test.
- Under this limited merchant-launch/reviewer scope, unknown ordinary Sandbox
  test traffic is not itself a customer Production entitlement prerequisite. The
  original notification-delivery requirement has genuine receiver and actual
  reviewer-purchase proof. Keep the optional ordinary-dispatch scenario deferred/
  unaccepted, rather than changing TEST behavior or adding a purchase just to
  improve the score. Coordinator must record that scope classification; this
  audit does not mark I03 accepted.
- If a later explicit scope promises ordinary nonreviewer Sandbox delivery, plan
  that named target's safe case then. Do not infer such a promise from a shipped
  relay helper or count source tests as an executed live ordinary transaction.

The declared actual Free-reader observation remains a genuine configuration
postcondition. Its legitimate reviewed coverage case is prepared separately. The
Production credential boundary is also explicit: saved Sandbox success is not a
positive Production read, and documented first-release eligibility prevents a
prelaunch401 from uniquely diagnosing invalid credentials. See the
[authorization evidence review](2026-11-09-apple-production-auth-evidence.md).

## Verification and Brain impact

Read only the written requirements, pinned b0/current unchanged routing source,
saved sanitized receipts and custody metadata. No SDK online verification, Apple
API request, webhook replay, live profile/database read or device action occurred.
Offline doctor passed. One-owned-document quick smoke passed51tests/254assertions
plus QA tooling types; unrelated active AI/release work was excluded. Original
requirement text, paid/Free scope, pinned/current source equality, early-TEST-ack,
saved custody metadata, local links and diff assertions pass. Private mode0600
audit: `/private/tmp/ewatrade-i03-configuration-audit-2026-11-09.evidence.json`.
These checks qualify this audit, not a relay execution. Existing routing/source/
crypto/integration proofs are reused; no new fake event or repeated source matrix.

Scope/coverage/credential follow-up: the three owned documents pass51tests/
254assertions plus QA types and billing-source/phase/SDK/link/diff assertions.
The new private mode0600 source-review audit is
`/private/tmp/ewatrade-i03-followup-source-review-2026-11-09.evidence.json`.
No gateway, coverage, credential or runtime call was executed by that follow-up.

Brain impact: local `.brain/features/native-store-billing.md`,
`.brain/features/owner-wide-billing.md` and `.brain/tasks/in-progress.md`.
No API contract, source behavior, schema or configuration changed by this review.

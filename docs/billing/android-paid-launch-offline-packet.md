# Android paid launch: offline setup and review packet

Prepared 27 October 2026 from the local Android branch. This is a worksheet for
the future owner-wide billing candidate, not live Console/provider evidence or a
submission-ready declaration. No service, financial account or release setting
was changed. Current store policy must be reviewed separately when going online;
this offline packet does not claim a fresh policy check.

## Pricing and cutover checklist

| Plan | Monthly NGN | Proposed subscription ID | Proposed base plan | Separate businesses |
| --- | ---: | --- | --- | ---: |
| Starter | 5,000 | `ewatrade_starter` | `monthly` | 1 |
| Growth | 15,000 | `ewatrade_growth` | `monthly` | 3 |
| Pro | 30,000 | `ewatrade_pro` | `monthly` | 10 |

Proposed auto-renewing monthly/P1M offers have no approved trial, annual discount
or token pack. IDs are placeholders until actual Console readback. Review enabled
territories/currencies/taxes before activating offers; Nigeria prices alone do
not authorize other regional prices. Display the actual Play localized offer and
renewal phases, not this planning table.

- Prepared: prices, 1/3/10 coverage and per-business Catalog/order/staff quantities
  in `OWNER_BILLING_OFFERS`; ownership and new-admission policy tests pass.
- Pending: owner-account persistence, existing purchase/grant inventory, versioned
  cutover and durable plan/snapshot reconciliation. New signup defaults must
  change only at the explicit cutover. Never auto-charge an existing account.
- Pending: active server catalog/mobile mirror and all domain readers must use
  the same effective offer. Existing code's launch-free labels and legacy caps
  cannot be sold as the new owner-wide offer.
- Pending: native copy and recovery must identify the paying owner/account and
  covered businesses; switching selected business must not retarget a purchase.

See [owner-wide contract](owner-wide-subscriptions.md) for the staged allowances,
downgrade policy, concurrency requirements and post-restoration sequence.

## Owner and provider worksheet

Last recorded Console state required a merchant payments profile. No new readback
was performed offline. The owner supplies actual legal identity, address and any
requested verification/bank details, and personally completes binding agreements
where required. Do not put credentials or identity documents in this packet.

| Setup | Required record before acceptance | Current evidence |
| --- | --- | --- |
| Merchant profile | Actual app/developer/profile linkage, verification and agreements status | Open; prior creation did not complete |
| Products/base plans | Returned IDs, active base plans, territories, effective prices | Proposed only |
| Publisher access | Correct app/package permission; server credential in secure custody; authenticated verification succeeds | Not verified live |
| RTDN | Correct endpoint/audience/service identity; authenticated delivery and durable processing against target DB | Not verified live |
| Refund operations | Named primary/backup operator, policy version, monitored inbox, acknowledgement target and response procedure | Operator/delivery acceptance open |
| Public legal | Effective Terms/Privacy publication and actor's current versioned acceptance | Recheck exact candidate/cutover |
| Infrastructure | Available target DB, jobs and alert transport for this candidate | Production restoration/acceptance pending |

Current source configuration names, **not instructions to enable them now**:

- `STORE_SUBSCRIPTION_PRODUCTS`: exact `{store,productId,planId}` mappings using
  returned Console IDs. `PLAY_PACKAGE_NAME` must identify `com.ewatrade.app`.
- Publisher custody: `PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON`, or the existing
  server-side `GOOGLE_APPLICATION_CREDENTIALS` route. Never include private keys
  in mobile, screenshots, Brain or review notes.
- Authenticated notifications: `PLAY_NOTIFICATION_AUDIENCE` and
  `PLAY_NOTIFICATION_SERVICE_EMAIL`. Existing route suffix is
  `/webhooks/store/google`; confirm its mounted target URL before configuration.
- Checkout guards: `STORE_BILLING_ENABLED`,
  `STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED`, `STORE_BILLING_ENVIRONMENT`,
  `APP_ENV` and `DEV_PROFILE`. Sandbox and Production profiles remain distinct.
- Refund guards: `PLAY_REFUND_REVIEW_INTAKE_ENABLED`,
  `PLAY_REFUND_REVIEW_ACK_ENABLED`, `PLAY_REFUND_REVIEW_ALERTS_ENABLED`,
  `PLAY_REFUND_REVIEW_SUBMISSION_ENABLED`,
  `PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED`,
  `PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION`,
  `PLAY_REFUND_REVIEW_ENCRYPTION_KEY`, `PLAY_REFUND_REVIEW_KEY_ID`,
  alert recipients and the current live email transport configuration.

Use the existing platform-specific readiness validator
`scripts/check-store-billing-readiness.mjs --platform android` through the normal
profile tooling when online setup is authorized. Static success proves neither
permissions, product availability, durable notification receipt nor human on-call
coverage. Do not change gates just to obtain a passing check.

Refund-review acknowledgement must follow durable intake and actual monitored
alert acceptance. CLAIMED/UNCERTAIN one-time responses require reconciliation;
do not retry them blindly. Use the current source flags and canonical operator
runbook; older runbook disabled-profile statements are dated observations.

## Candidate data-handling worksheet

Use the existing local Brain `launch/play-data-safety-matrix.md` as the broader
inventory. Retain its open account/contact, merchant data, assistant, media,
location/Maps/Nominatim, SDK/transport and positive-data deletion questions.
Older Play33/Android35 observations are not billing-candidate proof.

| Billing flow | Facts supported by this source | Evidence still required before final answers |
| --- | --- | --- |
| Native checkout | Android IAP panel uses Play offers; receipt reference is sent for server verification before finishing transaction | Exact signed build, actual payload/destinations and failure/recovery behavior |
| Purchase verification | API calls Google Publisher with package/token; verifier reads account binding, product, paid order, environment and expiry | Correct service identity/app permissions and real signed sandbox response |
| Billing persistence | Current path saves purchase/order digests and subscription facts against a Tenant | New owner-account schema, linkage, custody, privacy inventory/export/retention and target verification |
| Notifications/refunds | Route authenticates Google identity; refund review custody uses encrypted tokens and aggregate alerts | Actual durable processing, recipient roles/retention, monitored delivery and one-time response outcomes |
| Owner-wide coverage | Staged logic adds owner-to-business association; there is no active adapter or new collection by this slice | Final persisted fields and actual candidate data map after integration |

Draft disclosure topic for review: **purchase/subscription history and account-linked
billing references used to verify, restore and manage software-plan access**.
This describes the intended feature, not a completed Google questionnaire answer.
Do not claim card-number collection, no sharing, ephemeral processing, all-data
encryption, deletion completion or provider exemptions without actual evidence.
No Data safety form was submitted or marked complete.

## Reviewer instructions draft

Release owner must fill in the exact version/build/runtime/source and secure
review access after the candidate is accepted. Never embed a password or real
customer receipt in this document.

> EwaTrade provides business operations for owners and their authorized teams.
> The Android app offers monthly software subscriptions through Google Play.
> Starter covers one owner business, Growth up to three and Pro up to ten.
> Catalog, order and staff allowances apply separately to each covered business.
> Plan & billing displays the actual store offer and provides purchase/restore.
> Ordinary business membership and permissions remain required independently.
> Account deletion is available through the app's account/privacy flow and the
> public deletion-information route. See the release owner's secure access
> instructions and the accepted candidate evidence for the reviewed paths.

Use this text only after those candidate behaviors are actually verified. The
current staged native messages still refer to one business; they require the
owner-wide integration, not merely this proposed review description.

## Focused acceptance checklist for the resumed window

- [ ] One minimal availability/access check after confirmed restoration.
- [ ] Owner-account migration/constraints and legacy/grant compatibility on the
  selected non-production target; preserve existing records and queued commands.
- [ ] Owner A's covered businesses, Admin/foreign-owner refusal, simultaneous
  enrollment, ownership loss, per-business usage and downgrade-over-cap handling.
- [ ] Exact signed Play candidate: localized offer, purchase, verification-before-
  finish, same-account restore, interrupted recovery and business/account switch.
- [ ] Authenticated renewal, expiry, cancelled auto-renewal through paid period,
  refund/void versus newer renewal, duplicate/reordered notifications and refund
  operator delivery/acknowledgement. Existing source tests are not provider proof.
- [ ] Reuse valid unchanged safety/deletion evidence; close remaining positive
  deletion, consent, media/location/SDK/transport gaps on the actual candidate.
- [ ] Candidate-bound Data safety answers and secure reviewer instructions;
  separately authorized internal distribution, submission and rollout.

No broad fixture matrix, real customer charge, repeated deployment or provider
activation is implied by this checklist. Offline packet preparation is complete;
all unchecked rows remain acceptance work. Android launch remains 1/8 accepted.

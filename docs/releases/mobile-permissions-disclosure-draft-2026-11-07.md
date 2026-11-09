# Shared paid-mobile disclosures — unapproved draft, 7 November 2026

For review against `2026-10-15-adult-chat-1`. This file changes no effective legal
document, approval metadata, acceptance digest or live publication. The owner has
confirmed paid owner subscriptions and broad supported international launch. This
is the one shared Apple/Android draft for billing, selected contacts and addresses.
It is not a complete approved Privacy Notice; retain the current effective snapshot
and acceptance history until all authoring holds below are resolved.

## Proposed Privacy addition: Contacts you select

When you choose a phone contact in New sale, EwaTrade uses the selected name and
phone number to help you identify or add the customer. On Android, the app asks
for contact access when you use this option. It opens your phone's contact picker;
it does not upload your entire address book. When you are online, the selected
phone number may be sent to EwaTrade to look for an existing customer or previous
sale before you save a new customer. If you save the customer or use it in a sale,
the selected details become part of the business's customer or transaction record,
accessible under that business's permissions and retention rules. You can enter
customer details manually instead and can manage contact permission in device
settings. Only use another person's details when you are authorized to do so.

## Proposed Privacy addition: Addresses and device location

You can enter a business address, city and state or region manually. These details
become part of that business's records and may appear on its store page where you
choose to publish them. The mobile launch uses manual address entry and does not
provide an automatic current-location lookup. An address may itself identify a
precise place even when you type it rather than use device location.

For the separate web signup feature, choosing “Use my current location” allows the
browser to send coordinates to EwaTrade for address lookup. The current web service
forwards those coordinates to OpenStreetMap Foundation's Nominatim service. That
web flow is separate from the mobile address form. Clearing a field does not erase
information already transmitted to a provider or saved in a business record.

Authoring hold: native source was closed in cf831c187 and Android config has
location-removal directives. Verify the exact signed SDK/permission paths before
publishing this claim. The separate web provider's suitability/retention remains
unaccepted; this paragraph describes the source, not approval to continue it.
Do not change a shared Privacy Notice into a blanket “we do not collect location”
claim or erase relevant historical handling. Reconcile embedded web flows too.

## Proposed Privacy addition: Google Sign-In and network information

When you use Google Sign-In, Google processes sign-in information under its
policies. For its iOS SDK, Google describes collecting a user identifier and IP
address, which may be used to estimate the device's general location for fraud
prevention. This is separate from manually entering an address or allowing the
mobile app to read the device's current location.

Authoring hold: signed iOS builds 8 and 10 contain GoogleSignIn 9.2.0. The embedded
manifest declares linked CoarseLocation for App Functionality, and Analytics
purposes for some identifiers/usage data. Aggregate the app and SDK declarations
when reconciling the final Apple label; the root manifest alone is insufficient.
Build 10 artifact verification and structural manifest equality are confirmed;
its native paid UI/purchase/restore acceptance is still pending. Build 8 accepted
login only, not the paid controls.
The manifest is not a packet observation or a location-permission grant. Google's
[iOS disclosure guidance](https://developers.google.com/identity/sign-in/ios/app-privacy)
supports IP-derived general location, so do not claim approximate location is
never collected. Reconcile the SDK analytics purposes before freezing the complete
snapshot. The iOS evidence does not automatically establish Android collection;
verify its matching SDK/version/flow separately. No declaration or effective legal
snapshot is changed by this proposed addition.

## Proposed Terms addition: Owner software subscriptions

EwaTrade offers monthly software subscriptions for business owners through the
app store used for the purchase. Staff access is provided through the business's
membership and permissions; staff do not need a separate owner subscription.
Starter covers one business, Growth up to three and Pro up to ten. Product, order
and staff allowances apply separately to each covered business. A business owner
selects which eligible businesses are covered; a subscription does not grant
access to a business the account is not authorized to manage.

The purchase screen shows the applicable store price, currency, monthly billing
period and renewal terms before confirmation. A subscription renews through the
same store unless cancelled there. Store availability and local prices vary by
territory. Payment for the software is separate from purchases of goods or services
from merchants using EwaTrade. See the Software billing policy for cancellation,
failed-renewal and fallback-limit handling.

## Proposed Billing Policy replacements

### Separate types of payment

The EwaTrade app is free to download. Business-owner software subscriptions are
paid monthly through Apple App Store or Google Play. Payments to merchants for
physical goods or services are separate transactions governed by that merchant's
sale, fulfilment and refund policies. Payment-provider charges may also be separate.

### Before purchase

Before you confirm a software subscription, the app shows the selected plan,
localized price and currency, monthly billing period, applicable tax presentation,
renewal terms and how to cancel. The store's purchase confirmation controls the
amount charged. Nigeria monthly reference prices are NGN5,000 for Starter,
NGN15,000 for Growth and NGN30,000 for Pro. Other territories use their displayed
local prices; currency conversion and store price points can differ from those
reference amounts. The launch offers monthly subscriptions without a free trial
or annual commitment.

### Mobile software subscriptions

Only an authorized business owner can start or restore an owner subscription.
EwaTrade verifies the store purchase before applying the plan to eligible covered
businesses. Restore with the store account used for the purchase and the matching
EwaTrade owner account. Changing the selected business does not transfer a purchase
between owners. Ordinary business permissions remain required independently.
Contact support@ewatrade.com if a verified purchase is not reflected correctly.

### Renewals, cancellation and refunds

Use the subscription controls in the store that billed you to manage your payment
method or cancel renewal. Cancelling renewal normally preserves verified access
through the end of the paid period; a refund or revocation may change that access.
Use the applicable store's refund process for a store-billed software purchase.
Refund eligibility depends on that store's rules and applicable rights; EwaTrade
does not promise that every request will be approved. Cancellation does not cancel
an unrelated merchant order, erase business records or close a business workspace.
For a merchant order or service refund, contact the seller identified in that
transaction.

### Failed renewal and retained records

If a monthly renewal fails, EwaTrade provides a five-day recovery period for the
owner to resolve the payment issue. Verified store access continues where the
store grants a longer entitlement. This recovery policy does not override a
refund, revocation, loss of business ownership or account-security restriction.
A temporary verification outage is not itself treated as a failed payment.

After paid access and any applicable recovery period end, the affected business
uses Free fallback limits for new additions. Existing records remain usable under
normal business permissions. Exceeding a fallback limit does not by itself delete
or archive records, make existing records read-only, or remove existing staff.
New additions above the applicable product, order, staff or business allowance are
blocked until there is capacity or verified paid access is restored. Account
privacy requests and lawful record-retention requirements are handled separately.

Authoring hold: five-day Play configuration and signed provider lifecycle evidence
are pending. Apple's approved additional server/application handling is owned by
the Apple chat and must pass acceptance before this wording can become effective.
Do not claim five days of native Apple grace or introduce outage-based courtesy.

## Proposed Privacy addition: Software-subscription information

When you purchase, restore or manage a software plan, EwaTrade exchanges purchase
references and account-binding information with Apple or Google to verify the
purchase, prevent use by an unrelated account and maintain the correct access.
EwaTrade records subscription status, plan, store, billing-period information and
the association between the owner and covered businesses. Store notifications
and necessary purchase references support renewal, cancellation, refund and
revocation handling. Authorized operators may use relevant billing information
to resolve an access or refund issue. Do not email passwords, store purchase
tokens or full payment-card details to support.

We may retain limited billing information needed to reconcile payments, prevent
receipt misuse, handle refunds or disputes, or meet applicable record obligations.
We minimize the personal profile separately from necessary billing links. Each
retained category needs a documented reason, expiry or hold basis, responsible
reviewer and next review date. We review retention within twelve months, or sooner
when the applicable deadline or hold requires it; review does not automatically
extend a retention period. The account-deletion result explains retained categories
and reasons. Closing a login does not automatically erase financial or business
records or cancel renewal. The store manages its own account, payment and
transaction records under its policies. EwaTrade's process does not claim to erase
the store's records.

Authoring instruction: replace the existing “App-store software purchases are not
offered in this mobile release” sentence in Privacy/Purposes and providers with
“Apple or Google processes app-store software purchases, and EwaTrade verifies
purchase and subscription information to manage software access.” Preserve the
remaining approved paragraph unless actual provider/feature evidence requires a
separately identified change. Reconcile specific stored/encrypted billing fields
and the active provider inventory before freezing the complete snapshot.

## Proposed Deletion replacement: Submit and track a request

You can start an account-deletion request in the EwaTrade app or on the published
account-deletion page, including when you can no longer sign in. We verify the
request using the account's contact channel and may need to resolve business
ownership or regulated-record obligations before finishing. We will tell you the
request status and send a result explaining which categories were deleted or
de-identified and which were retained, with the reason.

Deleting your EwaTrade login, removing a business from subscription coverage or
uninstalling the app does not automatically cancel a subscription billed by Apple
or Google. Manage or cancel it through the store that billed you. You can still
request account deletion without waiting for the subscription term to end.

## Shared support and provider references

Keep support@ewatrade.com as the public contact and the existing founders alias
for the operational recipient plan. Do not publish a guaranteed response time,
24/7 coverage or a named backup until actual coverage is accepted. Both platforms
use this one draft and the [shared launch index](../billing/mobile-paid-launch.md).

Official cancellation/refund guidance checked7November:

- [Google Play subscription management](https://support.google.com/googleplay/answer/7018481?hl=en)
- [Apple subscription cancellation](https://support.apple.com/en-us/118428)
- [Apple refund requests](https://support.apple.com/en-us/118223)

## Proposed Privacy addition: AI assistance and uploaded files

Live AI assistance is available to accounts declared 18 or older. Eligible
accounts aged 13–17 can continue to use ordinary business tools and saved history
under their normal permissions. Anonymous website help uses authored product,
plan and registration guidance. Age declarations are not verified age assurance.

When you use an AI feature, EwaTrade sends the information needed for that feature
to the configured processing service. This can include your message, relevant
conversation and business context, or the image or recording you choose to submit.
The resulting text or extracted details may be saved in the conversation and,
when you confirm an action, in the relevant business record. AI output does not
by itself authorize a business action.

Original assistant attachments are stored privately off-device. Removing an
original attachment does not necessarily remove messages, accepted business
records or information already sent to a processing service. Different record
categories and external services have separate retention and deletion handling.

Authoring hold: name the actual active services in the final snapshot after target
verification. Source supports DeepSeek/OpenAI text, OpenAI image analysis and
moderation, private Vercel Blob storage, and audio fallback through an operated
Whisper gateway, OpenAI and xAI. A failed audio attempt may transmit bytes before
the next provider is tried. Do not describe voice as on-device or all media as
OpenAI-only. Separate category suggestion and Storefront generation settings must
also be reconciled where reachable. Do not publish every compiled adapter as an
active recipient merely because it exists in source.

The live-AI age rule does not turn off automatic safety screening. When enabled,
OpenAI moderation can receive submitted text, including names, notes, addresses
or message content, and normalized catalog images. Those checks are distinct
from an AI conversation. This draft does not claim that every ordinary business
function is provider-free or that minors' submitted information never reaches
a provider.

Owner direction updated 9 November: retain the eligible 13+ ordinary actions and
add guardian-consent and regional safeguards for affected external safety
processing. Do not apply an adult-only restriction to those ordinary actions.
This is an implementation direction, not a claim that a guardian system or
regional compliance is already accepted. Guardian consent must remain separate
from the 18+ live-AI rule and cannot grant a minor live-AI access. The final
snapshot must describe the actual guardian verification, scope, withdrawal,
regional conditions, retention and alternative/recovery handling after acceptance.

Authoring hold updated 9 November: the approved adult-only live-generation
source is committed in `d13bc50f9` and verified locally, with the existing 13+
registration view preserved. It is not yet present in accepted hosted/signed
release evidence. Automatic-screening consent, applicable age-of-digital-consent
handling and recipient/payload conditions require separate reconciliation; no
automatic-moderation exception to provider terms is asserted. See the
[source receipt](../verification/2026-11-09-live-ai-adult-access.md) and
[automatic-screening review](../verification/2026-11-09-automatic-safety-provider-review.md).

The source uses a 30-day assistant-attachment timestamp and bounded cleanup that
confirms original-byte absence before clearing attachment content. Sent attachment
metadata and other conversation/business content can remain. This is not yet a
verified maximum hosted retention period; omit a fixed erasure deadline until
actual operations, backlog and external retention are accepted. OpenAI
`store:false` requests do not establish all-provider zero retention.

## Billing retention details for the final snapshot

The owner billing records contain account-linked purchase/order digests,
subscription status, product, environment, verification/expiry times and business
coverage history. They are not anonymous merely because purchase references are
hashed. Raw references are processed for store verification; separate Play refund
review can retain encrypted token and order references. No automatic retention
duration is defined for the owner billing tables in the reviewed source.

Authoring hold updated 8 November: the owner approved the minimum-necessary
paid-owner policy and source implementation. Source `49df03a06` supports explicit
category review, terminal checkout-link minimization, current-scope checks and
independent annual/earlier review duties. Development-only fixtures and source
checks pass. The three new settings remain dormant. This packet has not accepted
Production schema application, a positive live case, provider erasure or a requester
notice/result.
The prior empty-account case does not establish paid-owner fulfillment. Do not
publish this proposed wording until exact release-target behavior and the complete
legal snapshot are approved. See the [operator procedure](../billing/paid-owner-deletion-review.md)
and [source receipt](../verification/2026-11-08-paid-owner-privacy.md). Keep cancellation
separate from deletion and preserve the existing effective legal snapshot.

Source evidence and exact remaining target questions are maintained in the
[shared recipient/retention appendix](android-safety-privacy-review-2026-11-07.md#shared-billing-ai-and-media-source-reconciliation--7-november).
This addition changes no effective legal text, approval metadata or digest.

## Required reconciliation before an immutable publication

- Confirm the implemented paid subscription behavior on the release target; replace the current
  no-software-subscription claims in Privacy, Deletion and Billing Policy with
  verified model-specific wording. Do not claim account deletion cancels renewal.
- Complete active assistant/model/media recipients and data-retention facts;
  the existing OpenAI text-moderation paragraph does not describe every AI flow.
- Generate the complete next-version snapshot and digest through the existing
  legal publication mechanism only after the exact content is ready for approval.
  Keep existing approved content and acceptance history immutable.
- Obtain approval of that exact snapshot before setting approval metadata or
  publishing it. No approval or effective date is represented by this draft.

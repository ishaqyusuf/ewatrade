# Google Play support request — submitted 8 November 2026

Destination: authenticated Google Play Console support for EwaTrade.
Status: submitted through authenticated Play Console. The Managing monetization
case is Pending; Google has not assigned a case ID yet. No attachments were sent.

## Subject

Cannot save subscription base-plan price — error 540F8949

## Message

We are configuring monthly auto-renewing owner subscriptions for EwaTrade,
package `com.ewatrade.app`. Product creation succeeds for:

- `com.ewatrade.owner.starter.monthly`
- `com.ewatrade.owner.growth.monthly`
- `com.ewatrade.owner.pro.monthly`

Each product currently shows zero active base plans. Android bundle36 (1.0.0)
has successfully processed and is saved in an internal-testing draft. It includes
the Google Play Billing permission. We have not rolled it out or activated any
subscription base plan.

In a fresh Growth product form:

1. Add a base plan with ID `monthly`.
2. Select Auto-renewing, Monthly billing and a five-day grace period.
3. For diagnosis, temporarily select Nigeria only in the unsaved form.
4. Open the Nigeria price editor and enter NGN15,000.
5. Save the price popup.

The Console displays: “An unexpected error has occurred. Please try again.
(540F8949)”. This happens before the base plan can be saved. A separate Starter
form with localized regional prices also reports “Your changes couldn't be saved”
when saving the plan. No field-specific validation explains the failure.
Excluding future countries/regions and selecting a valid explicit account-hold
period did not resolve the Starter save failure.

Could you identify the reason the price editor/base-plan save is rejected and
which account or catalog prerequisite, if any, requires correction? Please keep
these products inactive and do not publish or roll out the app. We are requesting
diagnosis, not activation.

## Optional screenshot for the approved request

`/private/tmp/ewatrade-play-price-editor-error-540F8949.jpg` shows the exact error.
The screenshot includes the signed-in account avatar/Console context. The initial
request can be sent without it; request separate approval before attaching a
screenshot containing account identity or other private information.

## Scope of approval sought

Send the message above to Google Play Console support. It contains the app package,
three product IDs, build number, attempted draft settings, observed error and
reproduction steps. It excludes credentials, bank/tax details, personal documents
and account email. No contract acceptance, access grant, activation or rollout.


## Submission receipt — 8 November 2026

Owner approved sending this report with “ok send”, then separately approved the
mandatory feedback and specialist escalation: “Yes, give that feedback and create
the ticket”. Google initially generated an AI recommendation about combined grace
and account-hold duration. That suggestion is not an established diagnosis: the
report already documents a failed save with a valid explicit hold duration.

The first feedback-and-create action was rejected by automatic approval review
because “The recommendation is wrong or irrelevant” was treated as an additional
assertion. No ticket was created by that rejected attempt. After the owner's
explicit approval, that exact feedback was selected and Create ticket succeeded.

Google returned to Help with `formSubmitted=true`, listed Managing monetization
as Pending / Case ID pending, and confirmed **Ticket submitted**. It states that
replies arrive by email within two business days, with some tickets taking longer.
No response deadline or root cause is guaranteed. There was one successful ticket
submission, no duplicate case, attachment, catalog change or billing activation.

Confirmation capture: `/private/tmp/ewatrade-play-support-ticket-submitted-2026-11-08.jpg`.
[Authenticated support page](https://play.google.com/console/u/0/developers/9017957593475991384/help-and-support?app=4972793687190568960).

Next: await Google's response/case number, evaluate any proposed correction against
the actual saved settings, then complete the inactive monthly plans. The pricing
error, paid lifecycle and release gates remain open. No application source changed.

# Draft Google Play support request — owner approval pending

Destination: authenticated Google Play Console support for EwaTrade.
Status: prepared locally, not sent. No attachment has been transmitted.

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

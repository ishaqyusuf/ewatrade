# Google Play price-save retry — 9 November 2026

## Result

The existing price editor/base-plan failure no longer reproduces in the bounded
fresh-page retry. All three existing products now have a saved, **inactive Draft**
base plan `monthly`. Each was verified after a full page reload. No cause is
established: fresh page state, elapsed time and a possible provider-side change
cannot be separated by this observation.

| Product ID | Base plan | Nigeria price shown after reload | Billing | Grace | Automatic hold | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `com.ewatrade.owner.starter.monthly` | `monthly` | NGN 5,000.00 | Monthly, auto-renewing | 5 days | 55 days | Draft |
| `com.ewatrade.owner.growth.monthly` | `monthly` | NGN 15,000.00 | Monthly, auto-renewing | 5 days | 55 days | Draft |
| `com.ewatrade.owner.pro.monthly` | `monthly` | NGN 30,000.00 | Monthly, auto-renewing | 5 days | 55 days | Draft |

These plans currently contain **Nigeria only**, deliberately minimizing this
save reproduction. This is an inactive diagnostic catalog scope, not a change to
the owner's broad international launch choice or the app's saved 177-country
availability draft. Final international tables, Africa/outside-Africa adjustments,
tax treatment, price points and supported paid territories remain unaccepted.
The displayed Nigeria amounts are the exact table values; no actual charged
amount or checkout/tax outcome is inferred without the signed licensed test.

## Bounded reproduction

The owner asked what else could be tried while support investigates. A fresh
Chrome page, using the existing authenticated account, opened the existing Growth
product. The saved product list initially showed zero active base plans for all
three products. No new product or account was created.

On Growth: create `monthly`, auto-renewing/Monthly, change grace 7 to approved5,
leave automatic hold (now correctly reading55), select only Nigeria in the
unsaved form, enter15000 in the individual NGN price popup and Save. The popup
closed with NGN15,000 in the table, rather than error540F8949. Saving the complete
form changed the route to the persisted base plan and showed Draft monthly.
A full reload retained the amount and policy. The same sequence then saved
Starter5000 and Pro30000, each separately reloaded and verified.

The final pages show an available **Activate** action and disabled **Save changes**;
Activate was never clicked. No price save was certified merely from a toast or
popup: the persisted base-plan route and full reload are the acceptance signal.
This is Console configuration acceptance, not signed purchase/lifecycle acceptance.

Private screenshots captured after each reload:

- `/private/tmp/ewatrade-growth-monthly-saved-2026-11-09.png`
- `/private/tmp/ewatrade-starter-monthly-saved-2026-11-09.png`
- `/private/tmp/ewatrade-pro-monthly-saved-2026-11-09.png`

Screenshots are viewport evidence of the draft/policy; the visible accessibility
readback additionally verified each Nigeria price row. Raw account context is not
committed. No HAR, token, credential, bank/tax information or customer data was
captured in the repository.

## Support and competing hypotheses

Authenticated Help and case details now show **Open**, case **6-1181000042003**,
title “Error saving subscription base plan price”, created/last updated8November.
This supersedes the historical Pending / Case ID pending status. The original
approved error540F8949 report is present; the Console says replies are sent by
email. Focused connected Gmail searches for the error/package/Play support, then
exact case ID/title, returned no messages. This does not establish another inbox's
contents. No duplicate ticket, attachment or follow-up message was sent.

The public [Google Play status dashboard](https://status.play.google.com/),
checked9November, showed no incidents for its listed services. The dashboard
covers select services, not every Console workflow; this neither establishes a
root cause nor proves all Google systems healthy.

The same account/profile/bank state was retained. Bank details remain owner-deferred.
The successful saves disprove that the earlier generic error necessarily required
changing this grace policy or adding a bank account to save these inactive plans.
They do not establish full merchant/charging/payout eligibility. No local code fix
or local regression seam exists for Google's Console; the genuine UI save/reload
is the relevant external feedback loop.

## Next phase and boundaries

Continue the existing localized catalog/territory task: expand these same inactive
base plans with the approved regional policy, reconcile exact stored tables and
only then merge actual Play mappings through the existing shared release owner.
Do not replace Apple mappings, activate offers or public checkout as part of this
receipt. The existing Google case can receive this evidence only under a specific
message authorization; no follow-up was sent merely because the original report
was approved.

Android A01–A08 remains1/8. The price-save reproduction gate is cleared for all
three minimal drafts; A03 still needs complete localized offers/merchant acceptance,
and runtime, signed money, privacy/legal, review and release gates remain open.
The 18-ticket breakdown remains a draft pending owner review; its first ticket's
reproduction requirement now has evidence, without pretending the issues were
published or that Google has closed the case.

No application code, runtime/config flags, EAS artifact, deployment, account
verification, bank detail, Play activation, payment, rollout or review submission
changed. The existing starter/growth/pro products were reused. Concurrent Apple,
branding and shared-index changes are foreign and excluded.

## Documentation validation

Offline doctor passes without runtime/database/provider probes. The owned three-document fast plan has no unmapped paths. Focused smoke
passes 51 tests / 254 assertions plus QA-tooling types; all 15 internal file links
and owned whitespace checks pass. No application, emulator, provider money or database tests are repeated for
this documentation-only source change. Local Brain task and native-store-billing
records are updated; the private unpublished first ticket gains the observed result.

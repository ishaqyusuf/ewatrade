# Android audience and country review — open acceptance gates

9 November 2026. Read-only review; no audience declaration, country selection,
content rating, API access or legal terms were changed or submitted.

## Saved audience and existing product policy

Play Console → App content → Actioned → Target audience and content shows
13–15, 16–17 and 18+ selected; all younger groups are unselected. The overview
reports last edit 12 October 2026. The opened form's Discard changes control is
disabled. Private AX/screenshot evidence:
`/private/tmp/ewatrade-play-target-audience-2026-11-09.txt` and `.png`.

This agrees with `packages/utils/src/legal-documents.ts`: accounts and Store
creation are available from 13, subject to applicable payment-provider adult
requirements. Eligible teens can use structured features; declared adult status
gates free-form Store chat/replies. That self-declaration is not verified identity
or age assurance. Business positioning does not make the whole app adult-only.
The shared Apple coordinator independently reconciled these existing facts.

A bounded source/Brain review found no existing Play Age Signals integration or
prior substantive Brazil age-signal decision. This is an implementation and
compliance gap to resolve under the established audience, not a reason to silently
change the minimum age or exclude Brazil.

## Requirements to carry into acceptance

Primary sources were checked on 9 November 2026. Google's country guide is expressly
not an exhaustive determination of legal compliance.

| Area | Relevant requirement / next evidence |
| --- | --- |
| Brazil merchant | Follow Google's actual business/officer/address verification request for payouts; prior CAC records do not certify current authority or residency. |
| Brazil age signals | Digital ECA guidance requires store age-range ingestion for apps aimed at or likely accessed by minors. The saved teen audience makes self-declaration alone insufficient evidence. |
| EU | Supported EU destinations remain included; trader/contact declaration is separately pending. |
| Japan | Verify public operator name, telephone and address through the applicable account/payment-profile route. |
| Korea | Registration fields apply to Korean developers; gaming/mature-content/location-service provisions need separate applicability review. |
| India/Vietnam | Gaming and securities-market provisions are category-specific. Business inventory/sales software is not securities trading merely because of its name. |
| Israel | Additional identity process depends on Israeli billing address; follow actual applicable requests. |

[Country requirements](https://support.google.com/googleplay/android-developer/answer/6223646?hl=en)
are the primary basis for this triage, not legal certification.

## Age Signals technical frontier

[Play Age Signals overview](https://developer.android.com/google/play/age-signals/overview)
and [integration guide](https://developer.android.com/google/play/age-signals/use-age-signals-api)
describe access request, runtime age-range/sharing response and limited permitted
use. The integration guide currently identifies Android library 0.0.4 (updated
23 October 2026), API23+. Returned signals may be used only for age-appropriate
experiences/compliance, not marketing, profiling or analytics; API use accepts its
terms. Request/terms approval, denied/unavailable/no-consent behavior, minor feature
policy, data minimization and actual signed Play-installed behavior remain to be
reviewed. No SDK was added or API used by this review. The documentation's client
library collection statement does not establish this application's full Data safety.

Ticket 06 remains open for country requirements. Ticket 10 safety and ticket 16
Data safety must consume the eventual exact implementation and signed evidence.
The accepted draft catalog remains 173 app/plan destinations with 519 available
prices and three retained/unavailable CAR prices; no availability changed here.

[Regional catalog](2026-11-09-play-regional-plans.md) ·
[Private Play test profile](2026-11-09-play-preview-profile.md)

# Approved chat disclosure publication — 15 October 2026

Status: owner approved the exact wording and legal-only publication on 15 October.
Marketing, Dashboard and API publication are live and verified. The first API
build failed on baseline compiler blockers; the owner separately approved the
repaired exact source931cbfc0 and its verified deployment.
Approved version: `2026-10-15-adult-chat-1`, effective 15 October 2026 after approval
and verified rollout. Historical `2026-10-09-support-contact-1` receipts stay attributable
to their original version.
Only the additions/replacement below change; all other approved sections remain.

## Terms: add to Accounts and access

Free-form Store chat is available only to signed-in account holders who declare
that they are 18 or older. The same requirement applies to staff sending free-form
replies, and those replies require an active adult account conversation. Guests,
accounts with no age declaration and accounts declaring an age under 18 cannot
send free-form Store chat. Eligible account holders may continue to browse catalogs
and use permitted account and structured transaction features. Conversation history,
reporting, blocking and Support remain available under their access controls.
An age range is a declaration; EwaTrade does not describe it as identity verification.
Contact Support if a saved age range needs correction.

## Privacy: replace Age eligibility

EwaTrade asks for an age range for account and supported customer-entry features.
The choices distinguish ages 13–15, 16–17 and 18 or older. We record the chosen range
and declaration time, rather than a date of birth. People under 13 cannot create an
account. Free-form Store chat requires a signed-in account declaring age 18 or older;
Guest and younger accounts cannot use it. Existing permitted browsing, structured
request, history, reporting and Support features have separate access controls.
Contact the privacy address if you believe a person under 13 provided personal
information or if a stored age range needs correction.

## Privacy: add Text safety screening

When text safety screening is enabled, EwaTrade sends the submitted text to
OpenAI's moderation API to check for abuse and safety concerns before accepting it.
The text adapter sends the text and the selected moderation model; it does not add
your account ID or profile details. Text you submit may itself contain personal
information. This screening also applies to supported catalog and structured
request text, not only chat. Screening failures pause the affected write rather
than treating unchecked text as safe. Authorized human operators handle reports
through the published Support channel.

OpenAI currently documents no training use, abuse-monitoring retention or
application-state retention for its moderation endpoint. This endpoint-specific
policy is not a promise that EwaTrade's own conversation and business records are
erased, and does not describe other AI features or providers. EwaTrade does not
claim organization-wide Zero Data Retention. Provider processing may take place
outside Nigeria; contact the published privacy address for the applicable provider
and transfer details. Photos, audio and documents follow their separate feature
controls and are not made safe by text screening.

## Review and activation boundary

The account remains 13+, while free-form Store chat is 18+. This amendment does not
activate pharmacy, paid software subscriptions, new messaging providers or media
processing, and does not change a saved user's age declaration. Existing acceptance
receipts remain attributable to the version accepted. The new version must use the
ordinary exact-version acceptance checks; no receipt is fabricated or backdated.

The repository's `packages/utils/src/legal-approval.ts` says approval metadata may
be set only after the owner approves the exact versioned snapshot. Approval of
product scope on 9 October did not approve the wording. After approval, create a
new snapshot/digest, deploy only the required legal changes against verified live
source, and check public Marketing/API versions before the Production release gate
can pass. Signed adult/teen/undeclared/Guest, media and operational acceptance
remain separate checks; this document does not attest those results.

Sources checked 15 October:
- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance

The immutable JSON candidate beside this file pins the complete approved document set.
Candidate SHA256: `b4c57354ffcfeae2cb01be2b3bf57c9e7eaa468d95f32807ec8e25499bae45c5`.
Approval recorded at `2026-10-15T14:06:00.454Z`, reference
`owner-approval-2026-10-15-adult-chat-b4c57354`. Publication digest:
`302a4b24da5303e09f91b57724cb4d1e66b3cabc01d25cc4855d4335776e8cff`.

Verified live Marketing base `0b4dee0e` was used for the isolated two-file legal
commit `ff98332c4bbd2172659558180b28690da8dc1e24`. Marketing deployment
`dpl_AVks8JM7DsAotYPNrWQHF1ct3tu6` is READY and the exact public legal preflight
passes. API publication attempted the same application source plus deployment-tool
pagination repair in `8bf7de6687f81587a73c33d89c1ab718288f7fcc`; the build failed before upload on existing assistant compiler errors. Expanded
repair931cbfc0 was separately approved and deployed as
`dpl_8DVDUGUGd5PnwUiqmQrmAdBNG2PH`. Exact project/team/Ready state, public
health/auth/legal and API/Marketing version reconciliation pass. No acceptance receipt or user age was changed.

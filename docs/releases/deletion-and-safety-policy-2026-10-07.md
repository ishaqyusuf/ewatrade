# EwaTrade deletion and safety operating proposal

Owner approved the 24-month receipt/evidence period, 12-month review, 90-day
contact-data limit and Ishaq Yusuf as initial lead on 7 October 2026. OpenAI text
moderation is also approved. Backup nomination remains pending. These are company
policy decisions, not assertions of statutory retention periods. Operational
activation and acceptance remain pending.

## Proposed retention decisions

| Material | Proposed action | Purpose and end condition |
| --- | --- | --- |
| Name, original login email, phone, images, metadata and age declaration | Clear after verified identity, access revocation and domain review | No continuing account-profile purpose after deletion. |
| Password hashes, login sessions, linked-provider credentials and mobile verification codes | Delete; obtain provider revocation evidence first | Prevent further access; clearing an Apple token locally is not proof of remote revocation. |
| Terms/Privacy acceptance receipts | Retain only the existing pseudonymous user ID, version, document hash, acceptance time and surface for 24 months after completion | Demonstrate which notice/terms were accepted and resolve complaints; review necessity at 12 months, delete at 24 months unless a specific documented legal hold applies. No name, email, IP address or device fingerprint in the receipt. |
| Deletion contact email and notice delivery metadata | Keep only what is needed to deliver the result and resolve delivery issues; clear identifying contact data 90 days after confirmed delivery/completion | Permit result delivery and short-term follow-up. A documented unresolved dispute/hold requires a named owner and a new review date. |
| Minimal deletion evidence ledger | Retain pseudonymous request/subject identifiers, processing dates, policy version and outcome digests for 24 months; review at 12 months | Prove processing and investigate complaints. Do not describe this as anonymous or fully erased. |
| Merchant transaction records and attribution | Separate controller/domain review; preserve integrity without retaining unnecessary profile/contact fields | Accounting, contractual and dispute purposes need their own documented rule and expiry. This proposal does not authorize bulk removal of merchant records or invent a statutory period. |
| Clinical/prescription records | Separate pharmacy-controller review | First-release pharmacy functionality remains deferred. Existing historical records still need a truthful outcome. |
| Backups and third-party copies | Document each actual provider's deletion/expiry behavior; prevent deleted profiles from being reactivated on restore | Do not claim immediate erasure from every backup or provider without evidence. |

The 24-month and 90-day periods are proposed operational limits. The owner approved these periods for the stated purposes. Domain exceptions
still require documented controller review before activation.
[NDPC privacy principles](https://ndpc.gov.ng/our-data-privacy-policy/) require
keeping personal data only as long as needed for its lawful purpose; they do not
establish these proposed periods.

The prepared profile processor supports explicit ERASE or RETAIN acceptance
choices and reports retained linkage. It does not yet implement the proposed
90-day/24-month lifecycle or positive-data processing for every business domain.
Approval of this proposal must be followed by that implementation and acceptance;
changing a configuration flag alone is insufficient.

## Proposed support ownership

- Ishaq Yusuf: initial privacy and abuse lead for founders@ewatrade.com.
- Recommended backup: a trusted operations/customer-support teammate. Nominate
  that person and verify coverage before launch, using individual accounts, MFA
  and a restricted case queue. No backup person has been assigned.
- Check the inbox and report queue every business day. Target acknowledgement
  within one business day, urgent safety triage within 24 hours, and ordinary
  deletion completion within 30 days. Record exceptions, required handovers and
  reasons in the case; notify the requester of material delays.
- Log only the case ID, category, owner, dates, disposition and necessary evidence.
  Restrict message/clinical content to staff who need it for the case.
- Review the queue and missed targets weekly. The code cannot certify that a
  human monitors an inbox; perform a real synthetic delivery/response exercise.

These are proposed service targets, not claims about current staffing or legal
deadlines. The primary lead is confirmed; backup nomination and real inbox coverage
acceptance remain pending.

## Approved provider and remaining safety evidence

OpenAI is approved for chat text moderation. The prepared adapter sends only the
text and pinned moderation model, never account IDs or profile metadata. It
rejects any flagged category, incomplete responses and provider failures.

OpenAI currently lists `/v1/moderations` as having no abuse-monitoring or application
state retention and as ZDR eligible in its
[data controls guide](https://developers.openai.com/api/docs/guides/your-data).
This endpoint-specific statement must not be replaced with the generic 30-day
retention rule for other endpoints, nor treated as proof of organization-level
ZDR settings. Its [under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
also requires appropriate safeguards and zero retention before processing personal
data below the applicable digital-consent age. The worldwide 13+ product scope
remains selected; regional age/consent handling and disclosure still need evidence.

Text filtering does not cover photos, files, audio or every operating procedure.
Media provider availability, reporting, blocking, response ownership and exact
signed-client behavior remain release checks. No customer data was used in the
synthetic moderation evaluation.

## Acceptance sequence

1. Approve the retention choices/purposes and named operating lead; confirm backup.
2. Finish domain and retention-lifecycle processing, delivery/webhook setup, and
   ordinary/staff/sole-owner/Apple-linked isolated acceptance.
3. Finish safety and iOS audience evidence, then review/publish source and satisfy
   the native-build environment gates.
4. Build the exact iOS candidate; verify login/deletion/chat/report/block and EAS
   Update receipt/recovery; capture screenshots and provision reviewer access.
5. Complete truthful App Privacy/age/review answers, upload to TestFlight and submit.

Preparation checklist: 3/6 complete. Four-step release scope: 0/4 complete;
deletion and chat safety in progress, signed iOS and submission pending.

## Deletion retention implemented and Development verified — 9 October 2026

Preparation remains **3/6 (50%)**; release acceptance remains **0/4**, steps 1–2
in progress and 3–4 pending. This update supersedes the missing-table blocker and
“expiry implementation pending” observations above.

Current remote main 9c17f56f is merged into the isolated release branch (8bc298f3).
The moderation adapter/approval gate from assistant PR56 is already in main; no
duplicate provider activation is required. The inherited CLI-help assertion was
corrected. Concurrent changes in the primary checkout remain untouched.

`AccountPrivacyRetention` now binds completed requests to an exact approved policy
digest and deadlines calculated from completion: contact cleanup after 90 days,
necessity review at 12 calendar months, receipt/deletion-evidence expiry at 24
calendar months. Leap days clamp to the target month's last day. Completion creates
its retention row atomically and refuses absent/mismatched retention approval.
At 90 days, identifying contact/outcome data, recipient digest and provider lookup
identifiers are cleared. At expiry, request-scoped notices/outcomes/access evidence
and receipts accepted on or before completion are removed; later receipts and
pseudonymous User/business linkage are preserved. This is not full anonymization.

Platform-admin review rereads authority in a fresh transaction; a documented hold
has a named operator and review date no more than 90 days ahead. A hold stops
applying at that date unless renewed. Reviews do not restart the expiry clock.
A bounded daily job shares the existing daily cadence and logs counts of failures
or due reviews. Production flags remain disabled; no inbox email was sent.
Policy changes require deliberate reconciliation of existing digest-bound rows;
this processor refuses a different currently approved policy rather than guessing.
After contact expiry, historical OTP lookup and old completion/delivery-proof
rechecks are unavailable; they cannot silently reidentify an expired contact.

Remote main lacks the newer sales-rep fields already applied to shared Development.
A direct schema push would drop them. An isolated rollout overlay preserved the
exact committed ecf42196 fields/index and its generated migration history. Fresh
read-only diff showed only two new tables plus their indexes/FKs. Guarded root
`db:migrate --local` generated/applied
`20261009083444_account_privacy_retention_and_analytics`; guarded root
`db:push --local` then reported in sync. The exact generated additive migration is
copied into the release branch. No hand-written SQL, reset or data-loss bypass.
Development only; Preview/Production schema rollout remains separate.

Validation: 334 unit/API/job checks pass, 9 integration cases skip in the unit run,
1,024 assertions. EAS wrapper checks: 51 pass, 312 assertions. Scoped generated-client
TypeScript passes. Live guarded retention fixture: 1 pass/19 assertions, including
90-day cleanup, 12-month review, bounded hold/24-month expiry and zero remaining
owned users. Profile/retry fixture: 2 pass/32 assertions, both receipt choices,
analytics-residual rejection and unrelated-account preservation; owned fixture
cleanup executes. One earlier concurrent fixture run exposed P2034 serialization
conflict; atomic source processors now retry only rolled-back P2034, at most three
fresh transactions, rereading authorization and current state each time.

Added `preview-simulator` extending Preview and guarded `--ios-simulator` selection
only for iOS Preview builds. Environment, exact clean commit, Preview host and iOS
identity guards remain intact; Production/OTA/submission gates are unchanged.
This enables native QA without the missing ad-hoc Preview signing credentials.
[Expo simulator-build documentation](https://docs.expo.dev/build-reference/simulators/).
No successful native binary, OTA, TestFlight upload or submission is claimed here.

Still required: real domain processing and result-email delivery; ordinary/staff/
sole-owner/Apple-linked end-to-end acceptance; positive assistant/chat/analytics and
business/clinical dispositions; provider/age safeguards; signed native flows and
real EAS Update; screenshots/privacy report/restricted reviewer access; submission.
Ishaq Yusuf remains the approved privacy/abuse lead; a named backup is still pending.

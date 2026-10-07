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

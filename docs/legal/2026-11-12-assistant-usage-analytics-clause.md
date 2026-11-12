# Proposed legal wording: product usage analytics (for owner review)

Status: **for the owner's review — not published, not deployed.**
Context: owner decision 12 November 2026 — assistant/product usage analytics
across web, mobile, WhatsApp and Telegram are covered by EwaTrade's general
terms; no separate per-user consent. Implementation:
[assistant-analytics-events.md](../assistant-analytics-events.md).

## Why this is not yet in `packages/utils/src/legal-documents.ts`

The live documents are an approved, hash-pinned publication
(`LEGAL_DOCUMENT_VERSION = "2026-11-12-web-subscriptions-1"`,
`LEGAL_DOCUMENT_APPROVED_SHA256` in `legal-approval.ts`). Changing any section
text in place makes `isApprovedLegalPublication()` false, which blocks
production signup and de-indexes the legal pages on the next release. Adding
this wording therefore needs a new version string plus a fresh owner approval
(effective date, approval time/reference and the new SHA-256), done together.

Note: the publication check rejects text containing the word "draft"
(`DRAFT_PUBLICATION_MARKERS`), so the wording below avoids it.

## Privacy Notice — new section (after "Purposes and providers")

**Title:** Product usage analytics

**Text:**
To understand and improve EwaTrade, we record product usage events from the
web dashboard, the mobile app and the EwaTrade assistant on WhatsApp and
Telegram. Examples are an assistant reply completing, failing or reaching its
allowance; an assistant proposal being created, confirmed, cancelled or
expiring; a review link being opened; and a WhatsApp or Telegram chat being
linked or removed. Each event records the channel, the kind of input (text,
voice, image or document), the assistant step count, model and response time,
and your workspace role. Your account and business are represented by keyed
pseudonymous references; the business name may be shown as a label. These
events do not include message text, attachments, phone numbers, Telegram
usernames or IDs, email addresses, amounts or customer records. Outside the web
dashboard they are recorded only for accounts that declared age 18 or older.
Test and QA accounts are excluded, and the web dashboard respects your
browser's Do Not Track or Global Privacy Control setting. Our analytics provider
stores these events for us; contact the privacy address for provider, location
and retention details.

## Terms of Service — added sentence (end of "Accounts and access")

Using EwaTrade, including the EwaTrade assistant on WhatsApp and Telegram,
includes the product usage analytics described in the Privacy Notice.

## Publishing steps (owner-approved release only)

1. Add the section/sentence to `LEGAL_DOCUMENTS` and bump
   `LEGAL_DOCUMENT_VERSION`.
2. After owner approval, set `LEGAL_DOCUMENT_EFFECTIVE_DATE`,
   `LEGAL_DOCUMENT_APPROVED_AT`, `LEGAL_DOCUMENT_APPROVAL_REFERENCE` and
   `LEGAL_DOCUMENT_APPROVED_SHA256` (from `currentLegalPublicationDigest()`).
3. Run `bun test packages/utils/src/legal-documents.test.ts`.
4. Turn on `LOGLY_ASSISTANT_EVENTS_ENABLED` for webhook channels only after the
   updated notice is effective.

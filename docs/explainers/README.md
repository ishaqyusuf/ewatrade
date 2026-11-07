# Business manual banking explainer

Open [the A–Z field guide](business-manual-banking.html) directly in a browser.
It is a standalone, offline HTML document with no remote scripts, fonts, analytics
or service dependencies. The original checkout is needed for linked source docs.
Printing uses the browser's print dialog and a dedicated print stylesheet.

The guide covers 26 topics, the payment journey, evidence/confirmation authority,
and two illustrative amount explorers: fresh-transfer allocation and existing
customer-credit application. Inputs use integer minor-unit arithmetic. Examples
do not call application APIs or create financial records.

## Scope and sources

Snapshot: 28 October 2026. Read the newer
[MB-01 implementation contract](../payments/manual-banking-mb01-implementation.md)
alongside the earlier
[receipt-assessment plan](../payments/manual-payment-receipt-assessment-plan.md).
The contract supersedes the older plan's implementation-not-started checkpoint.
The guide also cites the
[notification policy](../payments/payment-report-notification-policy.md) and
local Brain feature, ledger, Finance and acceptance records.

Base/local-source behavior, MB-01 work in progress and future provider automation
are labeled separately. This document does not accept a product milestone,
change the Finance roadmap, propose replacement product UI or alter the selected
Banking02 v18 Workshop revision. No live availability or release is certified.

## Verification

- Offline QA doctor passed. Full changed-path fast plan inspected; concurrent
  banking implementation paths excluded from the eventual documentation smoke.
- Standalone Chromium check: 26 topics, 43 links, unique IDs, valid local source
  links/anchors, no page errors and no network dependencies.
- Representative interactions: smaller/larger/excess transfers; refund holds
  versus availability; exact kobo; invalid inputs; unresolved excess; partial/full
  credit; overspend/invalid holds; keyboard tab switching.
- Desktop and 390 px document layout/screenshots reviewed. This is HTML document
  verification, not product UI, native-device, money integration or release QA.
- Dedicated documentation-only `test:quick` result is recorded in the local Brain
  delivery receipt. No banking implementation tests or financial writes are
  implied by that result.

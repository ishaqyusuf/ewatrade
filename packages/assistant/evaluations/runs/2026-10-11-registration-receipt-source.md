# Purchase agreement receipt overlay — 11 October 2026

Evidence: manual-web component and global missing-provenance check; no database write.

PurchaseRegistrationDetailsSheet is registered behind existing Finance access in
GlobalSheets. Assistant receipt Open maps exact recognition/Book IDs to URL params;
Close clears only its params, preserving the current page/chat. Canonical query,
loading/error/retry and missing-Book refusal are used.

Canonical recognition read adds Book currency, supplier display name and entered
unit names. The source loader reuses its existing Book read and includes unit name
with lines; source authority and original evidence validation stay intact.

Compared three local layouts (agreement first, stage first, compact ledger), selected
agreement first to keep goods and recognition distinct. Actual component browser
showed exact amounts/quantities/date, unrecognized state, reversed original invoice
and separate correction/reason. Global missing-Book alert and Close to /assistant
passed. Scoped dashboard TypeScript passed. No saved-record fetch or receipt-button
acceptance claimed yet; those require the canonical proposal fixture.

Screenshot artifacts/assistant-operations-web/e05-purchase-receipt-details.jpg;
comparison and component harness retained beside it. Temporary route and tab removed.
Editor, assistant database confirmation and full web acceptance pending. No mobile,
schema, activation or deployment. E05 incomplete.

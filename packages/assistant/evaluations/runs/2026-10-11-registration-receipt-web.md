# Saved purchase agreement receipt — 11 October 2026

Evidence kind: manual-web, provider/model not applicable. Fixture PA08 (receipt only).
Named local web QA bakery account, QA-classified tenant, newly owned Finance Book,
marked chat and two goods. Canonical assistant proposal confirmed by fixture code;
shared runtime capability remains planned. No browser confirmation or model request.

PASS: saved chat loads Purchase agreement registered. Clicking its actual Open
button sets the exact recognition and Book parameters and shows the global sheet
without leaving /assistant or changing the chat. It displays QA ACME Supplies,
Flour 2.125 bag / NGN 10.00, Sugar 1 bag / NGN 1.00, total NGN 11.00 and the exact
2026-10-01T12:00:00.123Z agreement time. Recognition history is empty; no invoice,
ownership or receipt event is inferred. Close removes only sheet parameters and
preserves the chat, QA message and completed receipt.

Screenshot: artifacts/assistant-operations-web/e05-registration-receipt-open.jpg.
Inspected screenshot shows the sheet and saved assistant chat together.

Cleanup verifies one completed proposal, two agreement lines, 1100 minor cost and
zero events/journals/receipts. Independent Book/chat/goods counts are all zero.
Fixture, verification and cleanup scripts/evidence remain
local and ignored. Full browser edit/review/confirm, invoice/ownership/physical
receipt, settlement and live-model acceptance remain pending. E05 incomplete;
roadmap 13/45 accepted (28.9%). No mobile/schema/timeout/activation/deployment change.

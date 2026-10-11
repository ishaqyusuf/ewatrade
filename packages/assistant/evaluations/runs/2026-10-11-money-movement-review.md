# Money movement preview — 11 October 2026

Base c92a4d33/b721aa8a plus shared preview/source extraction. Provider-free unit checks.
Read-only preview supports transfer, owner contribution and withdrawal; rejects opening
balances. Shows exact source/opposite account identities, currency, minor amount,
debit/credit direction, posting timestamp and no-real-transfer effect. Shared account
resolver is also used by canonical execution, retaining Book scope, active money
accounts, same-account and opening-date checks. Preview additionally checks current
authority, date/closed period, Store, description and active equity control.

5 focused tests/55 assertions and scoped TypeScript pass. Includes transaction replay
regression plus transfer direction, contribution/withdrawal controls, archived equity,
missing scope/accounts, same-account and invalid/before-start/future/closed dates.
No database effects or browser flow tested here. No screenshots: no UI change.

Proposal schema/adapter/editor and a read-only registered movement receipt overlay
remain pending. Existing money-reversal sheet is a correction form, not a receipt view.
E03 remains incomplete and no capability was activated. Mobile excluded.

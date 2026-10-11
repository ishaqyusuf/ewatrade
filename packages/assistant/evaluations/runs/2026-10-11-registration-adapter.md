# Purchase registration proposal source — 11 October 2026

Evidence: deterministic schema/review tests, no provider/model execution.

Strict purchase_register action binds exact Book/supplier, agreement date, distinct
active-Store goods/unit/configuration targets, exact quantities and total cost per
line, categories and explicit agreementOnly=true. Rejects actor/Store/command
injection and excess totals. Session supplies Store. Planned dashboard Owner/Admin
finance.purchase.register delegates to canonical registerFinancePurchaseInTransaction
inside proposal completion. Fresh canonical review fingerprint includes period,
supplier identity, exact line details and unit names. No nested transaction.

Receipt finance_purchase_registration requires Book and recognition ID. It describes
only the agreement, with no invoice/payable/payment/ownership/stock implication.
Editor and registration receipt overlay are not implemented yet; rollout stays planned.

4 focused tests/54 assertions passed. Scoped API compilation passed; coverage regenerated successfully. PA01–08 fixtures retained. Canonical regression
previously passed separately; assistant atomic proposal/database/web acceptance
remains pending. E05 incomplete. No mobile/schema/activation/deployment.

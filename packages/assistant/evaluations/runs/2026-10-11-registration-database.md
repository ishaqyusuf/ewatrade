# Purchase registration database regression — 11 October 2026

Evidence: deterministic-integration, no model/provider call.
Run805b6125-81c5-4ea8-8103-5817dc9b2809; source baseline5fd9928c plus retained
focused branch in purchase-recognition.integration.test.ts.
Verified exact database: ewatrade_general_assistant_main_20261009.

RUN_DATABASE_INTEGRATION_TESTS=1 and RUN_PURCHASE_REGISTRATION_ONLY=1 select this
focused branch. It reuses the existing owned canonical purchase fixture/cleanup;
the default full recognition suite is unchanged. Test display name now identifies
the focused branch (name-only edit after run; captured log has the old broad name).

Passed16 assertions/54.62s, exit0:
- Fresh registration review matches supplier/Store/exact cost and agreement-only effect.
- Injected failure after registerFinancePurchaseInTransaction rolls back agreement
  and private accrual bill in the caller transaction.
- Two distinct goods lines register once; same command recovers the same document.
- Exact total1100, two lines, no events/invoice/receipts, one registration and one
  private PURCHASE_ACCRUAL; no actual PURCHASE bill.
- Journal count unchanged from fixture setup and no stock movement.
- Changed configuration rejected by review.
- All16 independent owned cleanup counts zero.

Scoped integration TypeScript passed. Transaction limits remain10s/30s.
Log /private/tmp/e05-registration-database.log retained locally.
This does not exercise receipt/invoice/ownership posting, settlement, or assistant
proposal confirmation. Those broader acceptance gates remain pending. No mobile,
activation or deployment; E05 incomplete.

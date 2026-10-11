# Money movement transaction preparation — 11 October 2026

Source c92a4d33. Deterministic unit evidence only; no model/database/browser run.
Canonical recordFinanceMoneyMovement exposes a caller-owned transaction function,
with unchanged Book/account checks and journal command. Root wrapper keeps10s/30s.
Two focused tests/10 assertions passed for root bounds, caller-owned replay without
nesting, fresh authority, payload conflict and same-account rejection before posting.
Initial expected replay hash fixture used unnormalized lines; corrected test fixture
to persisted normalized journal shape. No production hash change.

No assistant action, preview, editor or activation yet. New-effect atomicity,
concurrency, wrong-Book/closed-period and web acceptance remain pending. E03 incomplete.
No screenshot: no UI changed or exercised. Mobile excluded.

# Product return — no-Finance-Book database acceptance

- Date: 11 October 2026. Evidence: `deterministic-integration`.
- Run ID: `1de5f944-11c6-485b-96a3-6ea2366cfb7c`.
- Source: `247c0dfb`; clean worktree at launch.
- Target: isolated Development `ewatrade_general_assistant_main_20261009`.
- Verdict: **pass for no-Book stock/proposal composition**.
- Result: one pass, zero fail,29assertions,262.97seconds. Owned cleanup completed;
  process exited0. No provider/model, dashboard build or mobile test.

The fixture began with six units, fulfilled two and left four available with zero
reserved. Verified exact missing-target and over-return refusal, stale stock revision
refusal, and injected proposal-receipt failure rolling back both ProductReturn and
stock. A confirmed0.5restock produced one return, stock4.5 and a second movement
(the first movement was fulfillment). Replaying the same approval returned the same
receipt without duplicates. Damaged, quarantine and no-restock each recorded another
0.5return without adding stock or movements. Final state: four returns, two movements,
stock4.5, no reserved stock, no money collected. An additional0.000001return refused.
Review explicitly stated no Finance Book and no customer credit/cash refund.

Draft traces:41SQLcalls each,11475ms/12109ms, pool acquisition0.101ms/0.142ms. Previous
unoptimized run used57SQLcalls and14609ms/15128ms. This supports the intended graph
reduction, not a universal latency guarantee or root-cause claim for the earlier
transaction-start failure. Transaction limits stayed10smaxWait/30stimeout.

Log: `artifacts/assistant-operations-web/d03-return-database-optimized.log`.
Failures remain cataloged separately. The test restored its temporary in-process
capability activation. Runtime manifest remains planned. Financial valuation/journals,
foreign/clinical source browser cases, concurrent real DB races, full assistant
review/edit/confirm/receipt UI and live-model evaluations remain unaccepted. Overall
D03 is incomplete; do not count this as a financial or deployment pass.

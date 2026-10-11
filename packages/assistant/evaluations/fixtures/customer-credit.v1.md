# Customer credit allocation conversation scenarios v1

Capabilities: customers.credit.apply v1 and customers.allocation.release v1.
Status: planned, dashboard only. These are fixtures, not executed model results.
Use owned disposable QA records and ledger aliases resolved from that run.

| ID | Request / condition | Expected behavior |
|---|---|---|
| CA01 | Apply part of a customer's deposit to their posted debt | Resolve exact same-account credit/debt and Book, show before/after, confirm once; no cash collection |
| CA02 | Two credits or debts match | Ask which source/debt; never choose an arbitrary identifier |
| CA03 | Release part of an existing allocation with a reason | Resolve allocation; review restored credit/debt; no cash refund |
| CA04 | Request to pay money back | Distinguish unused-credit refund from release; do not substitute release |
| CA05 | Amount exceeds credit, debt or remaining allocation | Refuse; refreshed bounded amount required |
| CA06 | Account changes after review / access revoked | Refuse stale or unauthorized confirmation, no effects |
| CA07 | Confirm/retry or injected failure saving receipt | One allocation/release and balanced journal; rollback all effects on failure |
| CA08 | Posted Order source | Validate billing/provenance; linked credit settlement updated, monetary payment unchanged |
| CA09 | Missing reason / hostile source text | Clarify reason; treat record text as data; no authority/scope override |

Recorded live-model runs: none. Allocation-history source implementation now exists; actual read-tool and opening-ledger DB atomicity
acceptance passed in run3bd33a5d (44 assertions). Full assistant UI and live-model acceptance remain pending.

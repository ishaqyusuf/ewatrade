# Customer receipt proposal/database acceptance — 11 October 2026

Run `8fd13133-6af8-491b-afb8-2f0b64eb11a9`, source base `1bcb7465` plus integration
fixture in this commit. Evidence kind: deterministic-integration; provider/model
not applicable. Verified isolated Development database, owned disposable QA tenant.
Verdict: **pass**, 1 test / 32 assertions, 124.89 seconds, process exit0.

Verified canonical opening debt500 remains debt500 after receipt1000. New money
creates available credit1000, zero allocations, one receipt command/credit/receipt
row and one balanced two-line cash-debit/customer-advances-credit journal. Effective
time is at or after confirmation start. Sequential proposal retry returns the saved
customer receipt without another effect.

Unknown account and method/account mismatch refuse drafting; account revision change
refuses confirmation. Injected failure immediately before assistant receipt storage
rolls back credit/receipt/journal/revision and leaves the proposal pending. Fresh
review and normal confirmation pass. Financial cleanup counts and outer owned
user/tenant cleanup both verified; no suite remains running.

Test-memory capability activation is restored in finally. Transaction limits remain
maxWait10s/timeout30s. Parent test title includes default-suite cases not executed by
this focused branch. Does not prove concurrent confirmations, actual existing-order
payment source duplication refusal, full dashboard confirmation, HTTP transport or
live-model interpretation. These remain separate acceptance work.

Detailed local output: /private/tmp/e02-customer-receipt-database.log.

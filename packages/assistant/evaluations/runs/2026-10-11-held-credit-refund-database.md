# Held-credit refund proposal — isolated database acceptance

Date:11 October2026. Evidence:`deterministic-integration`, provider-free.
Source:`5998eb04`. Run:`1be3d8d2-b2ae-47fd-b5dc-d94a4e22e224`.
Database:`ewatrade_general_assistant_main_20261009` (verified Development target).

Verdict:**pass**,1test/30assertions,136.27s. Focused RUN_GENERAL_HELD_CREDIT_REFUND
branch; the parent test's generic name does not imply that its other branches ran.

A canonical Book and actual1000-minor-unit customer receipt supplied the source.
Foreign account and1001 refund refused. Changed account revision invalidated an
existing draft. Injected receipt failure rolled back refund entry, allocation,
finance journal and account revision; proposal stayed pending. Confirmation of250
succeeded and replay returned the same customer receipt without duplicates:
one refund debit250, one consuming allocation250, one two-line journal (customer
advances debit250 / cash credit250), account revision increased once. A further
751 refund refused against750 remaining. Review named the customer and stated
that the assistant does not send money.

Drafts8.607s/8.558s. Injected-failure transaction16.492s,69 SQL calls;
confirmation16.953s,70 SQL calls. Both retain10s max-wait/30s transaction limits.
These single-run observations are not a performance benchmark.

Financial fixture cleanup counts verified, outer owned tenant/user cleanup complete,
session11651 exited0. No DB process remains. Capability activation was in test
memory only and restored in finally; dashboard runtime remains planned.
Log:`artifacts/assistant-operations-web/e02-held-credit-refund-database.log`.

This proves the refund proposal composition for the tested receipt source. It does
not prove live-model conversation, full dashboard confirmation/customer-sheet flow,
all E02 operations or hosted deployment. Opening-credit, concurrency and correction
repository coverage is separate; this run must not be credited with those cases.
No mobile execution or provider refund occurred.

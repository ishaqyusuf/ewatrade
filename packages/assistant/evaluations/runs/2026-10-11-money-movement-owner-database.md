# Owner funds, concurrent confirmations and closed period — 11 October 2026

Run 1e6486d8-f255-426f-88c1-bd39b37fe6d2. Source1652182d plus extended fixture.
Evidence deterministic-integration; provider/model not-applicable. Isolated Development
QA database ewatrade_general_assistant_main_20261009, explicitly owned tenant.

1test/51assertions passed in136.74s. Scoped TypeScript passed. Transfer rollback,
response-loss replay, exact receipt and stale-account checks passed again.
Owner contribution250 debited cash/credited3000; withdrawal250 credited cash/debited3100.
Two simultaneous confirmations per owner proposal were awaited together. At least one
succeeded; every rejected attempt had CONFLICT, every success and follow-up retry
returned the same receipt. Exactly one journal per owner source kind remained.
Both journals had exactly two expected balanced lines.

A transfer drafted while open was confirmed after closedThrough advanced beyond its
date. Confirmation rejected CLOSED_PERIOD; proposal remained PENDING and total journals
and commands stayed3. All owned financial fixtures and outer tenant/user were cleaned.
Transaction limits remained10s/30s. Existing pg concurrent-query deprecation warning
was emitted but did not fail the run. Local log /private/tmp/e03-money-movement-owner-database.log.

This proves two competing confirmations of each owner proposal, not every possible
account-edit/period-close interleaving during execution. Successful dashboard
review/confirm/receipt acceptance and live-model evaluation remain pending. E03 remains
incomplete. No rollout/deployment/mobile work. No screenshot for database-only checks.

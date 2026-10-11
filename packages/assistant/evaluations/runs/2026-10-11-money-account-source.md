# Money account lookup source verification — 11 October 2026

Evidence kind: deterministic source checks; provider/model not applicable.
Canonical finance.moneyAccounts verifies active Owner/Admin membership, scopes the
Book to tenant and returns only unarchived ASSET CASH/BANK/CLEARING identities.
Default 20 / maximum 50 rows; assistant fixed at 10 with afterCode continuation.
Book currency is authoritative. No balance or external payout is inferred.

18 focused tests / 150 assertions pass across money-account-reads.test.ts,
general-access.test.ts and capability coverage. These cover scoped query filters,
bounded continuation/end cursor, missing Book, inactive authority, invalid paging,
planned rollout denial, role/plan gating and registry consistency. Initial registry
check rejected a hyphenated ID; corrected to finance.money_accounts.read before
passing. Scoped API/integration TypeScript and coverage generation pass.

Unit query-shape checks do not independently prove real database filtering. Database
execution evidence is recorded separately. No browser/model acceptance or rollout.

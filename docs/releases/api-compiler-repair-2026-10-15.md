# Approved API publication repair

The legal-only API release stopped before any upload because the deployed source
base fails the strict API build with 13 diagnostics. Marketing and Dashboard now
serve the approved `2026-10-15-adult-chat-1`; API still needs matching publication.

The owner approved the exact API deployment on 15 October 2026.
The ordinary isolated pinned-Bun strict build passes. Production deployment
`dpl_8DVDUGUGd5PnwUiqmQrmAdBNG2PH` is READY in the independently verified API
project/team, with canonical api.ewatrade.com alias. Health/auth/legal probes pass.
API and Marketing both report2026-10-15-adult-chat-1; public document hash matches
302a4b24da5303e09f91b57724cb4d1e66b3cabc01d25cc4855d4335776e8cff.
Acceptance remains required. Exact proof is saved beside this packet.

The approved API candidate is `931cbfc0388a91a8a3e6061848ccaf7d954c48b2`, built
from independently verified live source `0b4dee0e26fc0959ab9096f210e378abd04d3160`.
It includes the previously approved exact legal amendment and these extra fixes:

- Expense and money-in chat preserve the existing proposal ID when editing a
  draft. `editGeneralProposal` returns `id`; creation returns `proposalId`.
  Both callers now select the actual returned field. No confirmation is performed.
- Transfer receipts require a nonempty string entry ID from the canonical result
  before returning success. The existing refusal helper becomes a function
  declaration so TypeScript narrows the Finance Book correctly.
- Two test fixtures fix optional-method and Prisma mock typing. Two new isolated
  regressions cover new/edited proposal identity and valid/malformed receipts.
- The deployment inventory reader follows every project-scoped page, bounds and
  checks cursors, rejects incomplete responses, and retains required-variable,
  Production-scope and Sensitive-secret checks. Wrapper mocks cover its call.

There are three changed runtime assistant files. Their combined diff is 6 lines
added / 4 removed. The other changes are tests and deployment tooling. No schema,
permission, payment provider, rollout flag, OTP, workflow confirmation or customer
message changes are included. Existing assistant access/entitlements and canonical
confirmation authority are retained; no new assistant capability is introduced.

Validation completed before this decision:

- Full API TypeScript: strict, noCheck=false, noEmit, incremental=false — PASS.
- New proposal identity regressions: 4 pass / 4 assertions, after 2 failing cases.
- New transfer receipt regressions: 2 pass / 5 assertions, after malformed success
  was reproduced. These validate the result boundary, not a real money transfer.
- Existing affected assistant regressions: 15 pass / 81 assertions.
- Deployment inventory/wrapper regressions: 16 pass / 203 assertions.
- Scoped whitespace check: PASS. No connected database or provider action.

Exact extra patch versus the attempted legal API commit8bf7de66:
`api-compiler-repair-2026-10-15.patch`, SHA256
`ee8a2cb75da5748ad64e024cf5aa71706d8b79ff30036e12fcf789cab65c45ea`.
The isolated worktree is `/Users/M1PRO/.codex/worktrees/legal-chat-publication/ewatrade`.

Approved action: deploy only this frozen API candidate to the existing EwaTrade
Production API, then verify health, auth and exact legal version/hash. Ordinary
build and ownership checks remain mandatory. This decision does not approve an
OTA, Play submission, schema rollout, provider erasure or outbound customer mail.

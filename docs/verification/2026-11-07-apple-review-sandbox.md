# Apple App Review Sandbox source verification —7 November2026

Current result: source630f19b8/6a4948c8 deployed; genuine signed Preview Apple
TEST SUCCESS, receiver-only. Current production/provider outcome is recorded in
the final section below; earlier source-only entries retain execution history.

Current checkout/main, parent `5d961377e`; no worktree, branch change or deployment.
Only Apple review policy/API/DB paths, their tests, example flags, assistant-impact
record and the Apple/shared launch documentation belong to this change. Concurrent
Android Maestro/receipt/AGENT_CHAT changes are excluded and preserved.

## Result and boundary

Default-off exact immutable reviewer User-ID policy supports genuine Sandbox
purchases from a release application pointed at Production. Verified environments
remain Sandbox; current locked account/member facts govern durable application
and enrollment, and central readers use the same policy. No client environment,
email privilege, fake purchase, manual paid grant or schema change is introduced.
Ordinary/legacy/Google mismatches, legal/owner checks, limits and history remain.

Production lookup retries only HTTP404/API4040010; notification verification retries
only INVALID_ENVIRONMENT with full Sandbox envelope/nested transaction verification.
Approved reviewer events reconcile locally; other signed Sandbox events use the
explicitly enabled one-way fixed Preview relay with no redirects/credentials,
5s timeout and <=1KB positive acknowledgement. Failed delivery stays retryable.
Preview cannot relay back. Public checkout and native purchase scope stay closed.

## Executed checks

| Check | Result |
| --- | --- |
| `bun run qa:doctor --offline` | Pass; canonical Local profile isolation/dependencies/client present. No running source/schema claim. |
| Seven focused billing/owner test files | 57tests/345assertions pass, including the Preview no-relay case. |
| `review-environment.integration.test.ts` | Guarded Development Prisma1test/20assertions pass in38.2s; exact fixture users, Tenant, accounts, purchase/subscription/coverage/event rows cleaned. |
| Full API TypeScript,8GB heap | Pass. |
| Full DB TypeScript,8GB heap | Pass. |
| `bun run test:quick --plan` | All current paths mapped; then narrowed to the20owned paths to exclude concurrent Android changes. |
| Owned-path `test:quick --files …` | 283tests/1,796assertions, QA tooling types and changed-file Biome pass; no unmapped paths. Source smoke only. |
| `APP_ENV=local bun --cwd apps/api assistant:coverage` | H01 pass; coverage snapshot unchanged. |
| `bun assistant:impact` | H02 pass; one reviewed record, no capability/procedure changes. |

The integration wrapper reuses `loadRootEnvironment`, `applyDatabaseProfile` and
`loadProductionDatabaseUrl` from the existing scripts, requires explicit canonical
Local profile and expected Neon host, then starts only this test. Production is
excluded; no external Apple/Google/email call occurs. Trusted policy configuration
is injected into the test; the actual connected profile is never changed to Prod.
Private runner: `/private/tmp/ewatrade-apple-review-integration.mjs`.

The integration proves wrong owner/ordinary owner/Google refusal, Sandbox storage,
repeat uniqueness, locked enrollment, central coverage projection, disabled-policy
Free fallback and active membership loss. Existing transaction lock behavior is
unchanged; earlier concurrency evidence remains valid. Mock verifier/route tests
prove control flow/refusal, not cryptographic or signed StoreKit acceptance.

## Remaining coordinated rollout

1. Owner finishes prepared reviewer signup directly: age/agreement, email code,
   workspace and credentials. Resolve its approved inbox to an exact User ID;
   confirm Free owner-billing cohort/no legacy launch grant masks testing.
2. Review/set default-off review configuration for that one owner; existing
   release coordinator freezes/deploys the new candidate, with public checkout
   false and correct production/sandbox identity. No duplicate executor.
3. Verify Preview receiver/gates, then switch Apple's Sandbox URL from its current
   Preview URL to the verified Production gateway; perform positive genuine signed
   TEST plus reviewer/Preview lifecycle routing checks. Do not switch early.
4. Produce the registered signed iOS candidate with ExpoIap/OpenIAP, enable the
   intended native paid scope only with accepted prerequisites, then test purchase,
   restore, renewal/failure/grace/cancellation/refund and ownership/business switches.
5. Finish truthful privacy/legal/support metadata, candidate screenshots and review
   login/contact; submit first subscriptions with the app, follow review and publish
   under the owner's existing approval/check requirements.

Common Production DB/web/API/jobs already deployed at `bf9bc356`; receipt
`5d961377e`. This new source is not deployed. No live flags/URLs/financial settings,
charge or effective legal document changed. Earlier genuine Apple TEST was503,
not successful delivery. **Apple acceptance stays2/6 (33.3%)**; Android keeps its
own denominator. Brain feature/contracts/permissions/current-task pointers and
`decisions/2026-11-07-apple-review-sandbox.md` are updated locally (ignored).

## Bounded pre-deploy profile correction

The release coordinator explicitly handed back the source freeze before starting
any deployment. Canonical `loadRootEnvironment` emits DEV_PROFILE=production;
earlier Apple readiness/review/relay predicates accepted only prod. These three
predicates now accept either spelling, still requiring APP_ENV=production and
every prior flag/identity/owner gate. Local/Preview/mismatched profiles still fail.
Production sensitive settings cannot be read back as values; blank redacted
placeholders are not evidence they are empty or that either spelling is installed.
No Production setting was overwritten to work around that uncertainty.

Focused three-file correction tests pass11/134, including both spellings for
Apple public and review-only checkout, reviewer policy and the fixed relay, plus
Preview/profile negatives. An initial combined-store alias assertion failed on
the existing Play refund-submission profile gate; that Play policy remains
unchanged and Apple-only acceptance was tested in its correct scope. Prior full
API/DB types, H01 and guarded Development1/20 are reused: boolean profile spellings
are covered offline; transaction, persistence, membership, RPC and type shapes are
unchanged. Corrected owned-path smoke passes283/1796 plus QA types/Biome; H02
passes with the existing reviewed impact record updated for this follow-up.
Reviewer account readiness was checked by one exact approved-inbox lookup: no
account existed yet. No census, credentials read or Production write occurred.

Coordinator has set API Preview STORE_BILLING_ENABLED false→true for the next
deployment's genuine signed TEST window. Preview APP_ENV/DEV_PROFILE are preview;
owner/reviewer/forward flags remain absent. Production settings, public checkout
and native scope stay unchanged. This is not a successful canary or activation.

## Positive signed receiver and completed backend rollout

The coordinator opened an exact candidate Preview receiver window after verifying
source6a4948c809ea3a83d3aed9ae4ca2d3f6a96f40d3, Ready deployment
dpl_BY9LBysYJSevcEgbrA4VniDv9ZyT, canonical preview-api.ewatrade.com and health200.
Only Preview STORE_BILLING_ENABLED false→true changed. Owner/reviewer/forward flags
remain absent; public checkout/native scope, Production settings and saved URLs
were unchanged. No parallel executor or source change occurred during the window.

One genuine Sandbox TEST was requested with the approved existing key at
2026-11-07T21:40:33.540Z (**22:40:33WAT**). Apple's status API reported SUCCESS,
attemptDate1794087633549. The signed TEST was independently verified against pinned
Apple roots/SDK online checks, Sandbox environment and com.ewatrade.app. Sanitized
evidence: /private/tmp/ewatrade-apple-sandbox-canary-6a4948c8.evidence.json.
Token and signed envelope remain in mode0600 private custody, never Git.

Normal Production rollout then completed at6a4948c8: API
dpl_8hHnYj6S3rTwYCYgv659bbShqA9G, Dashboard/Marketing Ready, jobs20261107.2/tgh7ehhh,
executor exit0/API health pass. DB unchanged/synchronizedbf9bc356. Final web smoke
23694671-fd16-4587-bd63-f803ace90dcd passed with config fingerprint
35390ed991445f8cd7787d18231965c6edd449139fbb64660c0b2e31e2543578.
Native publication was excluded: Android's last run failed confirmation-selector
targeting, although earlier same-candidate identity/catalog/New sale passed. No
sale/payment was submitted. Exact release receipt is79fad7564 in
docs/plans/2026-11-07-full-production-release.md.

The coordinator explicitly lifted the final freeze with no active executor and a
clean checkout at79fad7564. This documentation reconciles accepted evidence;
no source test is rerun for unchanged billing/type/lock code. The existing offline
doctor and focused docs QA/whitespace checks cover this record. Reviewer signup,
exact owner ID/Free cohort, owner/review configuration, registered signed iOS
candidate, purchase/restore/lifecycle and Production relay are still open. A
successful TEST cannot close I03/I05; Apple stays2/6 (33.3%).

Documentation reconciliation checks: offline doctor and whitespace pass; explicit
three-owned-doc-path fast QA passes50tests/237assertions plus QA tooling types,
zero unknown mappings. Concurrent Android Maestro repair is excluded/preserved.
Brain feature/contracts/permissions/decision and current indexes are updated
locally; no schema, public contract, source behavior or effective legal change.

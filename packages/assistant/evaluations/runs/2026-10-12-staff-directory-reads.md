# S01 — canonical staff directory reads

12 October 2026. First S01 source milestone, not full ticket acceptance.
Roadmap remains13/45accepted28.9%,32awaiting71.1%:12partial19pending1deferredA04.
No mobile implementation/testing, model/provider calls, messages, credentials,
schema changes, runtime restart, persistent source activation or deployment.

Canonical `listStaffDirectoryPage`/`getStaffDirectoryMember` live in the DB query
layer, exported through `@ewatrade/db/queries`. API schemas reuse strict read
inputs. Existing merged retailOps router now exposes protected
`retailOps.staffDirectoryPage` and `retailOps.staffDirectoryMember`. General tools
`readStaffDirectory`/`readStaffMember` call these actual canonical procedures;
manifest capabilities `staff.directory.read`/`staff.member.read` v1 are planned,
dashboard-only, Tenant-scoped, manager role ceiling with native scoped-staff denial.
No proposal or invitation token is created or exposed by these reads.

Each request rereads active actor membership and active Tenant within its
RepeatableRead transaction. Owner/Admin and legacy Manager retain native staff
management visibility; scoped Manager, Cashier/Operator and revoked actors deny.
Server supplies actor/Tenant; inputs reject caller authority/scope and arbitrary
assistant page size. Search by user/profile name or email happens in SQL before
pagination. Current membership role/status remain authoritative, including REMOVED
when unfiltered. Exact total and page use one request snapshot; later pages are
live reads, not an immutable multi-request history snapshot. Filter-bound stable
ID cursor rejects changed Tenant/search/role/status/Store filters. Store filtering
means only exact saved ACTIVE assignments to an active same-Tenant Store; legacy
Store access is not inferred. Directory default scope is business-wide regardless
of selected Store. Profile identity requires matching subject/Tenant; absent
profiles and invitation/acceptance dates remain unavailable. History is not read
or reconstructed from current facts. Detached historical profiles are outside this
current-membership directory and require the separate history contract.

## Verification

Eight focused DB/API tests,93 assertions, pass: same-name identities/pagination,
exact count vs page, filter continuation refusal, strict inputs, fresh role/grant
and revoked-access denial before reads, Store scoping, exact detail and private
field omission, profile gaps and answer scope/history wording. No live database
connection was used by these unit tests. Owned query/router/formatter/helper/runner
scoped types pass; initial two fixture typing issues were corrected without
changing production behavior. Type session2173 exited0.

Real exact `ewatrade_qa_v1` classified owned QA Tenant/active Owner/session/Store
and existing GENERAL conversation verified. Sandbox connection failed before any
DB read; authorized network run56618 stopped on an honest fixture guard: only one
saved membership. Helper now records absent multi-page evidence explicitly.
Read-only run84577 exited0 in20.862s:1matching membership,1ACTIVE,0explicit Store
assignments. Actual canonical router first page/ACTIVE filter/Store assignment
filter and fresh missing-actor refusal pass; actual freshly authorized General
tools directory/detail/empty-name search/foreign classified-QA membership and
foreign Store reads pass. Five answer objects include unavailable refusals. Full
saved memberships/profiles/assignments/lifecycle/access audit/proposal facts are
unchanged. Read capability visibility exists only in this test process and
restores in finally; persistent manifest/runtime unchanged. Report:
`artifacts/assistant-operations-web/s01-directory-real-reads.json`.

## Remaining acceptance

Real multi-page and same-name database evidence need suitable owned QA fixtures;
current data does not establish them. Cursor-based lifecycle/access history,
actor/event/date filters and subject/actor visibility, explicit legacy history
coverage and actual saved dashboard rendering/navigation remain open. S01 stays
partial/unbookmarked. E05's bundled local-enable/restart approval remains pending;
no rejected reversal step was retried. Full45-ticket goal remains active.

Desktop Staff header now describes staff access/invitations across the business, correcting the prior Store-only wording. Existing composition/state/API and Store-specific sales-visibility card are unchanged. Actual desktop page screenshot verifies the copy; this does not certify planned assistant chat rendering or full S01 history acceptance.

Desktop screenshot: `artifacts/assistant-operations-web/s01-staff-directory-business-scope-web.jpg`. Actual reserved web QA sign-in and one saved Owner membership visible; business-wide description verified via HMR/DOM and pixels. Existing Staff page only, not planned assistant-tool rendering acceptance. Owned tab53 closed; no mobile viewport/device, staff invitation/status/access change or provider call.

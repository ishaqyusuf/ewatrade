# Global staff directory sheet source — 12 October 2026

Ticket S01partial/unbookmarked. Roadmap13/45accepted28.9%;32awaiting71.1% (12partial19pending1deferredA04). Dashboard only; no mobile/provider/rollout.

Fixture staff-directory-sheet.v1.json. Source base f4b7e92d; source milestone commit is tracked by this report's Git history. Existing Portless dashboard HMR; exact guarded ewatrade_qa_v1 owned-QA aliases. Stable non-hot owned API unchanged.

## Source

Strict optional GENERAL staff_directory navigation contains only original search/role/status/assignmentStoreId/cursor. Native protected retailOps.staffDirectoryPage still derives actor/Tenant and freshly checks authority/filter-bound cursor. GENERAL readStaffDirectory now forwards actual input to answer Open target. No arbitrary URL/authority/limit. Older history/member/no-target variants remain compatible.

Midday customers/filter/table/details pattern adapted to read-only bounded object: URL hook/Open/global wrapper/header/content/table/header/empty states/pagination. Existing Staff management workspace/forms/actions unchanged. Owner/Admin or legacy Manager directory authority, history Owner/Admin. Directory/member/history opens atomically clear sibling parameters; Close only clears own key. Search/role/status applies to URL, preserves original explicit assignment Store and resets cursor; Clear all removes all filters. Stable native ID order; ten-row query, exact total/page count, ISO UTC request time/live-page warning, safe original identity/current role/status/exact member Open and explicit profile/history/legacy gaps.

Query loading/invalid/unavailable/retry/refresh; identities hidden during fresh fetch. First/next controls use original filters and canonical cursor; no sorting/selection/bulk/DnD/new workspace route/schema.

## Focused and actual protected evidence

`EWATRADE_DATABASE_URL=postgresql://unused:unused@example.invalid/unused bun test apps/api/src/assistant/general-staff-directory-target.test.ts apps/api/src/assistant/general-staff-member-target.test.ts apps/api/src/assistant/general-staff-history.test.ts`:7tests74assertions pass. All seven roles/four statuses match native input, target excludes authority/limit/private fields, exact filter transport/count/bounds/old target regression. Scoped owned-file types pass, including final extracted pagination, shared tool callback and runner (session1543exit0; prior24250exit0).

Actual protected read-tool helper general-staff-directory-target.integration-check.ts, guarded runner staff-directory-target-reads.ts (session56643terminalexit0):2 actual answers7.435s. Exact Owner email/role/ACTIVE search -> one matching original member. Original INVITED same-name/cursor from prior canonical rollback -> zero current matches, original target search/status/cursor preserved exactly. Actual GENERAL fresh scope/capability/native guards, not formatter-only evidence. Read-only SQL MD5 snapshots verify all saved staff memberships/profiles/assignments/invites/lifecycle/access and owned chat/messages/proposals/runs/budget unchanged. Only this read capability temporarily visible in test process; restored in finally. No provider/tool mutation/proposal/budget use or saved staff action.

Prior INVITED-only three-page directory rollback report reused unchanged; canonical query not modified/rerun. Actual original DTOs, not saved memberships.

## Desktop evidence

Temporary route required exact owned QA user/Tenant Owner and refused production. Actual protected answer Open directory -> actual globally registered native query -> loading/unavailable (stable log staffDirectoryPage NOT_FOUND) -> Close. Real form applies QA search/SUPPORT/REMOVED, Clear all empties filters; URL and controls verified. Source preview error/warn list empty before assistant diagnostic.

Actual reusable content/table/pagination with prior canonical rollback pages:three separate same-name exact member IDs/emails, total3/page1, distinct request timestamps, first/next/end and final missing-profile coverage. Component Next callback replay is not live HTTP pagination. Exact third member Open hands off to one global staff-member sheet, correct original ID, unavailable/Close. Screenshots s01-staff-directory-first-page-web.jpg, s01-staff-directory-last-page-web.jpg and s01-staff-directory-filter-unavailable-web.jpg.

Over existing assistant/chat, original actual tool cursor target opens global sheet. Changed search clears cursor and retains INVITED; Close preserves /assistant and selected chat parameter/title. Saved chat contents still fail to load. Screenshots s01-staff-directory-over-assistant-web.jpg and s01-staff-directory-close-retains-route-web.jpg. Invalid JSON directory link yields closable alert, retains route/chat. Actual fresh protected zero-row continuation DTO renders exact0/page0 and no-memberships-after-cursor message in content; does not invent absent durable history.

Owned tab59 closed, temporary source removed; ignored preview source/artifacts retained. No native viewport/device, runtime restart, persistent capability activation, QA fixture deletion or deploy.

## Verdict

Source/strict target/fresh protected tool/filter transport and desktop component/URL recovery PASS. Successful query-backed live directory, HTTP first/next/refresh after fresh access, saved assistant answer/message continuity/durable history operational acceptance UNVERIFIED. S01partial/planned; no new bookmark. E05 bundled activation/ownedAPI restart approval remains pending; no rejected action retried. Full45-ticket goal active.

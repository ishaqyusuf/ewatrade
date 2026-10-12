# S01 — global staff history sheet source

12 October 2026. Source/component/navigation milestone; S01 remains partial,
unbookmarked and planned. Roadmap13/45 accepted28.9%;32 awaiting71.1%
(12partial19pending1deferred mobileA04). No mobile/provider/model/message,
schema changes, runtime restart, persistent capability activation or deploy.

## Source and boundaries

Shell-owned StaffHistorySheet registered once in GlobalSheets with Owner/Admin
visibility. useStaffHistoryParams stores a strict staff_history navigation DTO in
one nuqs URL parameter. Open button in GeneralAnswerCard preserves original
subject/actor/Store/stream/event/date/cursor filters. Close clears only this
parameter; selected chat and route remain. Protected native retailOps.staffHistoryPage
revalidates filters and fresh authority. No tenant/actor authority, arbitrary URL
or page limit can be transported by the strict optional answer target. Existing
answers without targets remain valid.

Wrapper owns the native tRPC/TanStack read with ten events, loading, unavailable/
retry, malformed-link state and refresh/first/next controls. New query keys follow
filter/cursor changes without retained prior-page placeholders. Page transitions
retain filters; first page removes cursor. Header/content/event/snapshot components
show exact or unknown matching totals, page length, UTC times/source/revision/
reason, safe subject/actor identity coverage and original before/after facts.
Missing fields remain unavailable; no invented ACTIVE status, false catalog-editor
flag or Store assignment. Legacy history remains partial even for zero events.

The answer summary is now bounded independently of long event identity/reason
strings; detailed original facts remain in native tool data and the sheet. This
fixes the previous ten-event summary's risk of exceeding the1000-character saved
answer contract. Closest Midday references: customer-details-sheet, open-customer-sheet,
use-customer-params. Target uses existing SheetFrame/shadcn wrapper, global provider,
protected query and URL state. Read-only bounded timeline needs no mutation/form
context, bulk actions, editable table, DnD, column resize or separate production
route. Contract/conformance recorded in local Brain staff-history-sheet plan.

## Focused evidence

Three focused API/contract tests23 assertions pass: original strict filters, gap
wording, ten long event records still producing valid bounded answer, exact target
filters, backward-compatible old answers and forbidden authority/limit/URL fields.
No live DB connection. Scoped owned API/shared DTO/dashboard types pass. Initial
undefined assignment diagnostics were fixed using explicit unavailable handling;
no status/access inference. No broad suites or repeated database runs.

Actual desktop browser on owned QA Tenant:
- Source Open button opens shell-owned Staff history dialog over the guarded source
  preview; protected runtime read reaches explicit unavailable state. Close removes
  only history URL param and restores source preview.
- Invalid history link over /assistant shows recoverable invalid-link state; Close
  retains /assistant and exact selected existing QA chat query parameter/title.
  The existing saved chat subsequently reports it cannot load in this Store.
  Selected chat navigation is verified; saved message preservation/rendering is not.
- Actual reusable content renders the five previously rolled-back canonical audit
  projections, including lifecycle status changes, unknown actor/subject, access
  before/after, unavailable fields and hidden Store references. These audit rows
  are not saved staff actions. No DB writes or invitations/status/grants occurred
  during this browser check. Source preview clearly labels synthetic rollback data.
- Screenshots retained: s01-history-sheet-unavailable-web.jpg,
  s01-history-original-facts-web.jpg, s01-history-close-retains-chat-web.jpg in
  artifacts/assistant-operations-web. Owned tab56 closed, temporary guarded route
  removed; retained preview source s01-history-sheet-preview.tsx is not shipping.

## Open acceptance

Successful protected sheet runtime read, real saved answer Open/Close/message
preservation, refresh/first/next through HTTP, durable history and directory
same-name/multi-page fixtures remain unverified. Runtime API unchanged; no missing
procedure cause is asserted from unavailable UI alone. Saved chat loading failure
remains unresolved. S01 stays partial/unbookmarked and all three read capabilities
planned. E05 local enable/API restart approval remains pending; no rejected step
retried. Full45-ticket goal remains active.

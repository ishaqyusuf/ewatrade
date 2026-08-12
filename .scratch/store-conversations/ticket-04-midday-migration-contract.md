# Ticket 04 Midday Migration Contract

## Reference Compared

Target:

- `apps/api/src/trpc/routers/service-commerce/conversations.ts`
- `apps/api/src/schemas/store-conversations.ts`
- `packages/db/src/queries/store-conversations-{core,staff}.ts`
- `packages/db/prisma/models/store-conversations.prisma`
- the existing Prescription queue, global-sheet, typed URL-state and bounded
  `DashboardTable` patterns in `apps/dashboard`

Midday analogue:

- invoice route/header/search/filter/URL hooks
- invoice data-table columns/header/actions/skeleton/empty states
- globally mounted invoice sheet, content router and form context
- API/query/package boundaries from the Midday API, jobs and package guides

## Migration Principle

Use the Midday invoice workspace as the interaction and ownership reference:
the authenticated route resolves scope and prefetches, the queue table owns
bounded list interaction, URL state owns filters/sort/detail, and one global
sheet owns the current conversation. Preserve EwaTrade's stronger security
boundary: queue rows contain no message body or customer/clinical contact;
repository commands own Tenant/Store authorization, row locks, exact source
revision and append-only audit.

## Filesystem Plan

- Add `/conversations` route composition under the authenticated dashboard.
- Add `components/store-conversations/*` for header, search/filter, detail,
  reply/handoff forms and form context.
- Add `components/tables/store-conversations/{columns,data-table,actions-menu,
  skeleton,empty-states}.tsx`.
- Add `hooks/use-store-conversation-{params,filter-params}.ts` and focused
  param/state tests.
- Register `components/sheets/store-conversation-sheet.tsx` in global sheets.
- Extend existing shared contracts, API schemas/router, DB repositories, jobs,
  Prisma models and focused/verified-Neon acceptance tests.

## Route And Page Plan

- Server-authenticate, resolve the active Store and reject unsupported roles.
- Parse URL filter/sort state, prefetch the bounded queue and selected detail,
  hydrate once, and wrap the table in existing Suspense/error recovery.
- Keep the page compositional: header, queue table and global sheet only.

## Header And Open Button Plan

- Show Store name, `Conversations`, privacy-safe queue guidance and a typed
  search/filter control.
- Omit a create button: customers create conversations through published Store
  entry links; staff cannot fabricate a guest thread.

## Sheet Plan

- URL keys own `conversationId` and `conversationSheet=detail`.
- The globally mounted sheet fetches authorized detail, renders safe timeline,
  exact Request context, assignment/SLA/escalation facts, claim/reply and
  release/handoff/reassign recovery.
- Close clears only conversation-owned URL state, resets the active forms and
  exact-invalidates queue/detail/eligible-attendant queries touched by the
  sheet.

## Form-To-Sheet Plan

- Reply and reasoned assignment commands live inside the detail sheet.
- RHF/Zod form context owns reply text, exact Request selection, assignment
  target and allowlisted reason. Success clears only the succeeded form and
  refreshes exact queue/detail state; typed conflicts keep input and offer
  refresh recovery.

## Filter, Search And URL State Plan

- URL-own `q`, assignment (`all`, `unassigned`, `mine`, `assigned`), SLA
  (`all`, `awaiting_response`, `overdue`), Request kinds, sort direction,
  selected conversation and detail mode.
- User filter/detail actions push browser history. Draft text remains local.
- Clear removes only Store Conversation filter keys.

## Table Plan

- Use cursor pagination ordered deterministically by selected SLA/activity sort
  plus id.
- Columns: response/SLA state, Request kinds/current state, assignment, latest
  customer activity and safe actions.
- Queue rows never include message text, contacts, media, OCR, provider facts,
  credentials or private staff identity.
- Provide loading, empty, no-results, error/retry and load-more states. Omit
  bulk selection/bottom bar because claim/release/handoff are row-locked,
  reasoned per-conversation commands and unsafe as bulk mutations.
- Omit DnD/column resizing for the compact bounded operational queue; preserve
  internal horizontal containment at compact widths.

## Columns And Row Actions Plan

- Row click opens detail. Action-menu controls stop propagation.
- Unassigned rows offer claim. Assigned rows open detail; only current primary
  can reply/release/handoff and manager authority can reassign.
- Sender projection remains `Store` unless a separately approved public-name
  fact exists; no legal name/email/role/id enters customer output.

## API And Data Plan

- Shared strict schemas define cursor/filter/sort, claim, revision-guarded
  reply, release/handoff/reassign and bounded reason codes.
- Queue/detail API derives actor/Tenant/Store from authenticated context and
  returns bounded projections.
- Repository claim/reply/assignment commands run in bounded transactions, lock
  the conversation row, payload-bind client operation ids and append immutable
  assignment/audit facts.
- Reply rechecks active Membership, Store ATTENDANT assignment, primary
  ownership, assignment/message/source revisions and current source policy
  immediately before append.
- Membership or Store-attendant suspension/revocation releases affected current
  assignments atomically and creates a safe escalation fact. A bounded job
  records overdue/unclaimed facts idempotently without customer content.
- Initial response-SLA threshold is one server-owned constant, used only for
  operational due/escalation projection; Ticket 09 may later expose guarded
  availability configuration without rewriting occurrence history.

## Testing And QA Plan

- Shared contract tests for strict schemas, cursors, reason codes and SLA
  projection.
- Repository/API tests for content-free queue, concurrent claim/replay,
  revision-guarded reply, non-primary view/no-reply, release/handoff/reassign,
  membership/assignment revocation, role independence, Store scope and audit.
- Job test for bounded overdue/unclaimed escalation replay.
- Verified-Neon acceptance for concurrent claim, reply conflict, handoff,
  membership removal, audit immutability and cross-Store isolation with exact
  cleanup.
- Authenticated desktop and 390px dashboard QA for loading/empty/error/retry,
  URL refresh/Back/Forward, claim, reply recovery, handoff, long timeline,
  keyboard/focus, sheet scroll and privacy-safe queue rows.

## Intentionally Omitted

- Customer read receipts/realtime foreground delivery are Ticket 08.
- Availability/manual pause configuration is Ticket 09.
- Private attachments and voice notes are Tickets 06 and 07.
- Bulk assignment, autonomous AI replies and customer-visible staffing detail
  are outside the approved product boundary.

## Open Questions

None. The approved ticket and consolidated specification determine the
authority, privacy, URL-state and audit boundaries.

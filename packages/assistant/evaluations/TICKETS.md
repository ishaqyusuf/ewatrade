# Assistant ticket status — 12 October 2026

Snapshot of the canonical 45-ticket roadmap. Web/dashboard acceptance only.

**Accepted: 13/45 (28.9%). Pending acceptance: 32/45 (71.1%).**
Of the 32 not yet accepted: 12 are partial, 19 are pending implementation, and
1 is deferred (A04, mobile, at the owner's request).
No mobile implementation/testing or hosted rollout is certified here.

Legend: ✓ complete for the current web scope; ◐ partially implemented/verified;
○ pending; ⏸ deferred; 🔖 accepted milestone. A partial pass does not complete
its parent ticket. Unbookmarked tickets are not accepted yet. Pending means no
accepted milestone is recorded; it does not assert that no related source exists.

| ID | Ticket | Implementation | Acceptance |
|---|---|---|---|
| A01 | Capability inventory and manifest | ✓ Complete | 🔖 Accepted |
| A02 | Execution adapter boundary | ✓ Complete | 🔖 Accepted |
| A03 | Dashboard GENERAL chat | ✓ Complete | 🔖 Accepted |
| A04 | Native acceptance and parity | ⏸ Deferred | Deferred |
| A05 | Controlled availability and read baseline | ✓ Complete | 🔖 Accepted |
| B01 | Customer create/update | ✓ Complete | 🔖 Accepted |
| B02 | Product editing | ✓ Complete | 🔖 Accepted |
| B03 | Catalog selling configuration | ✓ Complete | 🔖 Accepted |
| B04 | Operational lookups | ✓ Complete | 🔖 Accepted |
| B05 | Simple sale and receipt | ✓ Complete | 🔖 Accepted |
| C01 | Stock receive | ✓ Complete | 🔖 Accepted |
| C02 | Stock count | ✓ Complete | 🔖 Accepted |
| C03 | Adjust, waste and correct | ✓ Complete | 🔖 Accepted |
| C04 | Store transfer | ◐ Partial | Pending |
| C05 | Inventory closeout | ✓ Complete | 🔖 Accepted |
| D01 | Order amendment and cancellation | ◐ Partial | Pending |
| D02 | Fulfilment and status | ◐ Partial | Pending |
| D03 | Returns and payment corrections | ◐ Partial | Pending |
| D04 | Simple service work order | ○ Pending | Pending |
| D05 | Work lifecycle | ○ Pending | Pending |
| E01 | Accounts and money reads | ◐ Partial | Pending |
| E02 | Customer funds | ◐ Partial | Pending |
| E03 | Internal transfers and owner funds | ◐ Partial | Pending |
| E04 | Expenses and bills | ◐ Partial | Pending |
| E05 | Suppliers and purchasing | ◐ Partial | Pending |
| S01 | Staff directory and history | ◐ Partial | Pending |
| S02 | Staff invitations and lifecycle | ○ Pending | Pending |
| S03 | Suspend/reactivate staff | ○ Pending | Pending |
| S04 | Roles, Store assignments and handover | ○ Pending | Pending |
| S05 | Daily staff activity history | ○ Pending | Pending |
| F01 | Collection source contract | ○ Pending | Pending |
| F02 | Payment link and settlement | ○ Pending | Pending |
| F03 | Payout feasibility and domain | ○ Pending | Pending |
| F04 | Payout approval and dispatch | ○ Pending | Pending |
| F05 | Settlement and recovery | ○ Pending | Pending |
| G01 | Business reporting | ○ Pending | Pending |
| G02 | Cash count and close day | ○ Pending | Pending |
| G03 | Quotes, bookings and delivery | ○ Pending | Pending |
| G04 | Advanced inventory and catalog | ○ Pending | Pending |
| G05 | Settings and communications | ○ Pending | Pending |
| H01 | Coverage CI gate | ◐ Partial | Pending |
| H02 | Brain and feature change gate | ○ Pending | Pending |
| H03 | Evaluation and observability | ◐ Partial | Pending |
| H04 | Media and controlled multi-step use | ○ Pending | Pending |
| H05 | Operational acceptance and rollout | ○ Pending | Pending |

Current implementation focus: S01 directory/history while E05 local activation/API restart approval is pending.

E05 purchase fact reversal now passes signed rollback/stale refusal,
full saved web confirmation/history/reload and concurrent recovery for invoice and ownership;
three canonical procedures remain. [Latest evidence](runs/2026-10-12-purchase-fact-reversal-web.md).
[Payment reversal evidence](runs/2026-10-12-purchase-payment-reversal-web.md). Supplier creation and purchase registration
have focused database and saved receipt Open/Close evidence. Invoice, ownership and
physical receipt now pass actual dashboard Edit/re-review/Confirm and global receipt
Open/Close, with exact saved posting/stock/valuation readback. Full two-line assistant
receipt confirmation reaches forced completion rollback in 28.8s within the existing
30s budget; saved facts are unchanged. Completed receipt replay and duplicate-stage
refusal pass. **E05 remains partial and unbookmarked.** Supplier
advances/allocation and partial payment now pass full proposal rollback, actual chat
Edit/re-review/Confirm, saved receipt Open/Close and exact journal/balance/stock
readback with concurrent completed recovery. Three actions are source-available.
Supplier/purchase discovery is now source-available: name/code search resolves the
canonical Book, 12 real read checks pass and saved statement/invoice overlays retain
the assistant. Supplier creation and agreement registration are now source-available
and pass actual Edit/re-review/Confirm/Open/Close with exact saved effects and
completed recovery. Fresh stock preparation now batches 1–10 original goods; ten mixed sources prepare
in3.11s with saved financial/stock facts unchanged. Ten-line posting/valuation now passes canonical19.50s and signed assistant completion
rollback23.15s with100 category links; signed stale-stock refusal preserves all facts.
Advisory stock previews now batch; full GENERAL Edit review11.56s passes with rollback.
Maximum dashboard Edit/re-review/Confirm/Open/Close/reload and exact saved ten movements/
values/100 category links pass; concurrent completed recovery adds no effects. Broader
operational acceptance remains open. Nine real signed receipt refusal probes now pass
with all saved facts unchanged: changed token, old revision, revoked role, expired
session, closed period, archived posting account, retired configuration, changed
category label and changed valuation pool. Evidence:
[signed receipt guards and acceptance audit](runs/2026-10-12-supplier-acceptance-audit.md),
[maximum receipt web report](runs/2026-10-12-ten-line-receipt-web.md),
[ten-line receipt batch report](runs/2026-10-12-ten-line-receipt-batch.md),
[stock preparation bounds report](runs/2026-10-12-stock-bounds-preparation.md),
[supplier creation/registration web report](runs/2026-10-12-supplier-registration-web.md),
[supplier discovery report](runs/2026-10-12-supplier-discovery.md),
[supplier settlement web report](runs/2026-10-12-supplier-settlement-web.md) and
[physical receipt proposal/web report](runs/2026-10-11-receipt-proposal-web.md).
D02/D03 financial source performance and E02 credit-release web acceptance also
remain open; E03/E04 full browser confirmation remains open.

Canonical procedure checklist within E05 (the parent remains partial):

- [ ] `finance.recordPurchase` — shared canonical review/private preparation and full1–10 goods/100-category batched posting verified with exact rollback/readback/replay and four authentic stale-source refusals; strict assistant action,1/10-line dashboard editor and authentic signed completion rollback/stale last-line refusal now verified; saved dashboard confirmation/recovery pending. [Signed evidence](runs/2026-10-12-direct-purchase-signed.md). [Source/editor evidence](runs/2026-10-12-direct-purchase-source.md). [Canonical evidence](runs/2026-10-12-direct-purchase-canonical.md).
- [ ] `finance.recordSupplierOpening` — strict opening source/server Book-start review, both canonical rollback/replay/duplicate guards, dashboard editor and actual signed completion rollback/stale-review refusal verified; saved chat confirmation/recovery pending. [Signed evidence](runs/2026-10-12-supplier-opening-signed.md).
- [x] `finance.releaseSupplierAllocation` — signed completion rollback/stale refusal, actual dashboard Edit/re-review/Confirm/Open/Close/reload and saved concurrent recovery verified. [Evidence](runs/2026-10-12-allocation-release-web.md).
- [x] `finance.reversePurchasePayment` — exact original-payment correction, signed rollback/stale refusal, actual dashboard Edit/re-review/Confirm/Open/Close/reload and saved concurrent recovery verified. [Evidence](runs/2026-10-12-purchase-payment-reversal-web.md).
- [x] `finance.reversePurchaseRecognition` — signed invoice/ownership completion rollback/stale refusal, actual dashboard Edit/re-review/Confirm/Open/Close/reload, exact saved original/correction history and concurrent completed recovery verified. Physical receipt correction remains refused. [Evidence](runs/2026-10-12-purchase-fact-reversal-web.md).
- [ ] `finance.reverseSupplierEntry` — strict original-entry source, canonical rollback/replay, dashboard editor and all three signed completion rollback/stale-review refusal checks verified; saved chat confirmation/recovery and approval for source visibility/API restart pending. [Signed evidence](runs/2026-10-12-supplier-entry-reversal-signed.md).

The three pending procedures require assistant review/confirmation, owning receipts and relevant refusal,
rollback/recovery and web evidence. Existing registered-purchase flows do not accept
these separate procedures. E05 keeps its ◐ mark and has no 🔖 bookmark.

H01 has the coverage generator/check groundwork; complete CI acceptance is pending.
H03 has versioned fixtures and deterministic/manual-web reports; complete evaluation
and observability acceptance is pending. H04's separate media workstream does not
establish acceptance of the whole ticket.

Canonical definition/evidence: `.brain/plans/2026-10-09-assistant-business-operations.md`.
Detailed run reports: [evaluation catalog](README.md). Implementation completion,
acceptance, runtime availability and deployment are separate states.

S01 directory milestone: canonical membership search/detail, exact request-snapshot totals, filter-bound keyset pagination and two planned dashboard read tools implemented. Eight focused tests/93 assertions and scoped types pass. Real owned QA router/tool reads, empty results and cross-Tenant/Store refusal pass with staff facts unchanged. QA currently has one membership, so real multi-page and same-name checks remain open. Recorded lifecycle/access history source now implemented; saved dashboard acceptance remains open. S01 is partial and unbookmarked. [Evidence](runs/2026-10-12-staff-directory-reads.md).

S01 history milestone: original lifecycle/access streams, subject/actor/Store/event/date filters, exact recorded counts and filter-bound pagination, redacted before/after and explicit legacy/missing-stream gaps implemented. Nine focused tests/78 assertions and scoped types pass; synthetic rollback projection and actual fresh protected GENERAL reads preserve all staff facts. Actual answer rendering/timestamp hydration repair and screenshot verified; saved chat/global history object acceptance pending. Planned capability; no acceptance bookmark. [Evidence](runs/2026-10-12-staff-history-reads.md).

S01 global history sheet source: strict optional answer Open target, shell-owned URL/query sheet, original before/after/source/actor/time and first/next/refresh controls implemented. Three focused tests23 assertions/scoped types and actual rollback-projection content/source Open/unavailable/Close/malformed-link checks pass. Close retains assistant/selected chat; saved chat currently fails to load and successful native sheet read is unverified. S01 remains partial/unbookmarked. [Evidence](runs/2026-10-12-staff-history-sheet-source.md).

GENERAL history compatibility source milestone: unknown/retired payload or receipt now yields a safe read-only notice instead of aborting the conversation projection. Three focused tests11 assertions/scoped types and current protected owned-QA read pass with saved chat facts unchanged; live stable-API/browser recovery remains unverified. Existing A03 bookmark retained; H03/S01 remain partial. No new parent acceptance. [Evidence](runs/2026-10-12-chat-history-compatibility.md).

S01 exact member sheet source: strict staff_member Open target, shell-owned protected query/content/URL object, bounded previews and atomic member/history transition. Real three-page same-name directory rollback with saved staff/auth unchanged closes the synthetic database pagination gap; durable saved fixtures and full web acceptance remain open.13tests138assertions/scoped types, desktop original-facts/unavailable/Close/malformed-link evidence and screenshots pass. Saved assistant route/chat selection preserved, chat content still unavailable. S01 stays partial/unbookmarked, all reads planned. [Evidence](runs/2026-10-12-staff-member-sheet-source.md).

S01 global directory source: strict original search/role/status/assignment Store/cursor Open target, protected shell-owned ten-row object, filter controls/first-next/refresh/exact counts/full identities and exact member handoff. Directory/member/history opens atomically replace sibling targets.7tests74assertions/scoped types and two actual protected tool reads7.435s preserve targets and all saved staff/chat/budget facts. Desktop original rollback pages and actual global unavailable/filter/cursor-reset/Close/invalid-link verified with screenshots; saved chat still fails. S01partial/unbookmarked/all reads planned. [Evidence](runs/2026-10-12-staff-directory-sheet-source.md).
